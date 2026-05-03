library(sf)
library(tidyverse)
library(dotenv)
library(nycgeo)
library(tidycensus)


load_dot_env()
census_api_key(Sys.getenv("CENSUS_API_KEY"), install = FALSE)
ps_and_centroids <- read_csv('data/ps_and_centroids.csv')

nyc_acs <- get_acs(
  geography = "tract",
  variables = c(
      median_income = "B19013_001",
      white = "B02001_002",
      black = "B02001_003",
      asian = "B02001_005",
      hispanic = "B03003_003",
      poverty = "B17001_002",
      med_rent = "B25064_001",
      total_pop = "B01003_001"
  ),
  state = "NY",
  county = c("Bronx","Kings","New York","Queens","Richmond"),
  geometry = TRUE,
  year = 2024
) %>%
  st_transform(2263) %>%
  select(-moe) %>%
  pivot_wider(
    names_from = variable,
    values_from = estimate,
    names_prefix = 'demo_'
  ) 


#ACS use
acs_w_dist <- dplyr::inner_join(
  nyc_acs,
  ps_and_centroids |> mutate(geoid = as.character(geoid)),
  by=c('GEOID'='geoid'),
  relationship = 'many-to-many'
) |>
  mutate(
    across(c(demo_white,demo_black,demo_asian,demo_hispanic), ~ .x / demo_total_pop)
  )

type_cors <- lapply(acs_w_dist$type |> unique(),function(t){
  cormat <- round(cor(
    x = acs_w_dist |> 
       as.data.frame() |>
       filter(type==t) |>
       select(starts_with("demo_"),min_walk) |> 
       na.omit()
    ),2)
  
  cormat['min_walk',]
})

type_cors |> 
  bind_rows() |>
  mutate(type = acs_w_dist$type |> unique()) |> 
  select(-min_walk) |> 
  pivot_longer(
    -type,
    names_to = 'var',
    values_to= 'cor'
  ) |> 
  ggplot(aes(x=var,cor,y=cor,fill=type)) + 
  geom_col() + 
  facet_grid(. ~ type) + 
  theme_minimal() + 
  theme(axis.text.x = element_text(angle=40,vjust = 1, hjust=1))

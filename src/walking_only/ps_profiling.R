library(sf)
library(tidyverse)
library(nycgeo)
library(patchwork)
library(tidytransit)
library(tidycensus)
library(dotenv)
options(java.parameters = '-Xmx10G')
library(r5r)

core <- r5r::build_network("data/subway_r5r_stuff/")
public_spaces <- read.csv('data/nyc-public-space.csv')
public_spaces_geo <- read_sf('data/nyc-public-space.geojson')

nyc_map <- nycgeo::nyc_boundaries("tract")
st_crs(nyc_map) <- st_crs(2263)
nyc_centroids <- nyc_map %>%
  st_centroid() %>%
  st_transform(4326)


load_dot_env()
census_api_key(Sys.getenv("CENSUS_API_KEY"), install = FALSE)

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

#make destinations (the public spaces) in lon/lat
destinations <- public_spaces %>%
  st_as_sf(coords = c("longitude", "latitude"), crs = 4326) %>%
  st_coordinates %>%
  as.data.frame() %>%
  bind_cols(public_spaces) |> 
  transmute(
    id  = space_id,
    lon = X,
    lat = Y
  )

#use all tract centroids
origin_points <- nyc_centroids |>
  st_coordinates() %>%
  as.data.frame() %>%
  bind_cols(nyc_centroids) %>%
  transmute(
    id = geoid,
    lon = X,
    lat = Y
  )

tt <- travel_time_matrix(
  core,
  origins = origin_points,
  destinations = destinations,
  mode = c("WALK"),
  departure_datetime = as.POSIXct("2026-03-01 08:00:00"),
  max_trip_duration = 30
)

acs_w_dist <- nyc_acs |> 
  mutate(GEOID = as.character(GEOID)) |> 
  left_join(tt,by=c('GEOID'='from_id')) |> 
  mutate(
    across(c(demo_white,demo_black,demo_asian,demo_hispanic), ~ .x / demo_total_pop)
  )

#for those accessible to POPs, what do they look like?
acs_w_dist |> 
  filter(str_extract(to_id, '^[^-]+')== 'pops') |> 
  pivot_longer(
    starts_with('demo'),
    names_to = 'demo',
    values_to ='val'
  ) |> 
  ggplot(aes(x = val,fill=demo)) + 
  geom_histogram() + 
  facet_wrap(. ~ demo,scales = 'free_x') + 
  theme_minimal() + 
  labs(
    title = "POPs more accessible to white upper-class"
  )

#for those accessible to plazas, what do they look like?
acs_w_dist |> 
  filter(str_extract(to_id, '^[^-]+')== 'plaza') |> 
  pivot_longer(
    starts_with('demo'),
    names_to = 'demo',
    values_to ='val'
  ) |> 
  ggplot(aes(x = val)) + 
  geom_histogram() + 
  facet_wrap(. ~ demo,scales = 'free_x') + 
  theme_minimal()

#for those accessible to park, what do they look like?
acs_w_dist |> 
  filter(str_extract(to_id, '^[^-]+')== 'park') |> 
  pivot_longer(
    starts_with('demo'),
    names_to = 'demo',
    values_to ='val'
  ) |> 
  ggplot(aes(x = val,fill=demo)) + 
  geom_histogram() + 
  facet_wrap(. ~ demo,scales = 'free_x') + 
  theme_minimal() + 
  labs(
    title = "Parks more Accessible to Everyone"
  )

#for those accessible to stp, what do they look like?
acs_w_dist |> 
  filter(str_extract(to_id, '^[^-]+')== 'stp') |> 
  pivot_longer(
    starts_with('demo'),
    names_to = 'demo',
    values_to ='val'
  ) |> 
  ggplot(aes(x = val)) + 
  geom_histogram() + 
  facet_wrap(. ~ demo,scales = 'free_x') + 
  theme_minimal()

#for those accessible to misc, what do they look like?
acs_w_dist |> 
  filter(str_extract(to_id, '^[^-]+')== 'misc') |> 
  pivot_longer(
    starts_with('demo'),
    names_to = 'demo',
    values_to ='val'
  ) |> 
  ggplot(aes(x = val)) + 
  geom_histogram() + 
  facet_wrap(. ~ demo,scales = 'free_x') + 
  theme_minimal()

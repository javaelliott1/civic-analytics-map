library(sf)
library(tidyverse)
library(dotenv)
library(nycgeo)
library(tidycensus)


load_dot_env()
census_api_key(Sys.getenv("CENSUS_API_KEY"), install = FALSE)
public_spaces <- read.csv("data/nyc-public-space.csv")
public_spaces_geo <- st_read("data/nyc-public-space.geojson")
nyc_map <- nycgeo::nyc_boundaries("tract")
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

#transform to same type
st_crs(nyc_map) <- st_crs(2263)
ps_proj <- st_transform(public_spaces_geo, 2263)
nyc_land_boundaries <- nyc_boundaries()
st_crs(nyc_land_boundaries) <- 2263

#create a 30-min "reasonable to walk to" buffer
ft <- 3 * (30/60) * 5280

nyc_buffers <- st_buffer(nyc_map %>% st_point_on_surface(), dist = ft) %>%
    st_intersection(nyc_boundaries()) %>%
    mutate(
      tract_centroids = st_centroid(geometry)
    ) %>%
  dplyr::select(geoid,geometry,tract_centroids)

ps_and_centroids <- ps_proj %>%
  st_join(nyc_buffers,join=st_intersects,left=FALSE) |>
  mutate(
    distance = as.numeric( st_distance(geometry,tract_centroids,by_element = TRUE) ),
    min_walk = distance / 230 #valid for bryant park to central park, at least.
  ) |>
  select(geoid,space_id,type,geometry,tract_centroids,distance,min_walk)

unwalkables <- c(
  "park-shooters-island",
  "park-crescent-beach-park",
  "misc-governors-island",
  "misc-statue-of-liberty",
  "misc-ellis-island",
  "park-mill-rock-park",
  "park-south-brother-island",
  "park-north-brother-island",
  "park-pelham-bay-park",
  "park-hart-island"
)

ps_and_centroids <- ps_and_centroids |> 
  as.data.frame() |>
  filter(!(space_id %in% unwalkables)) |> 
  select(-geometry,-tract_centroids)

#what do these distances look like? is it a ring of public spaces, or are they dispersed within the buffer?
ps_and_centroids |> 
  as.data.frame() |>
  group_by(geoid) |> 
  summarise(
    mn_min_walk = mean(min_walk),.groups='drop'
  ) |> 
  ggplot(aes(x=mn_min_walk)) + geom_histogram() + 
  labs(
    title =  "Mean Minute Walks to Public Spaces Across Tracts"
  )
#showing that there's a 'shell shape' to these. (more ps in areas further away),
#which agrees with the '10 for 10' public spaces map.

#so far have shown that the 'shape' of these distances is ... odd. not unnatural,
#but i think it strongly depends on type,
#and if I had to answer why it looks like this, I'd argue it's a 'stickiness' of public spaces thing.
#i.e. public spaces are easier to put near each other than isolated.
#and i'd argue this with parks. it's easier to put an open plaza near a park,
# where there's already a lot of foot traffic,
#than some place that is decently car-frequent and doesn't have the space to fit one.

#but it begs a question, is that choice equitable?
write_csv(ps_and_centroids,'data/ps_and_centroids.csv')

library(sf)
library(tidyverse)
library(nycgeo)
library(patchwork)
library(tidytransit)

options(java.parameters = '-Xmx10G')
library(r5r)

core <- r5r::build_network("data/subway_r5r_stuff/")
public_spaces_geo <- read_sf("data/nyc-public-space.geojson")
public_spaces <- read.csv("data/nyc-public-space.csv")
nyc_map <- nycgeo::nyc_boundaries("tract")

st_crs(nyc_map) <- st_crs(2263)
nyc_centroids <- nyc_map %>%
  st_centroid() %>%
  st_transform(4326)

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

#sample a tract centroid
sample_tract <- nyc_centroids |> sample_n(10)
origin_point <- sample_tract |>
  st_coordinates() %>%
  as.data.frame() %>%
  bind_cols(sample_tract) %>%
  transmute(
    id = geoid,
    lon = X,
    lat = Y
  )

tt <- travel_time_matrix(
  core,
  origins = origin_point,
  destinations = destinations,
  mode = c("WALK","TRANSIT"),
  departure_datetime = as.POSIXct("2026-03-01 08:00:00"),
  max_trip_duration = 60
)

res <- public_spaces %>%
  left_join(tt, by = c("space_id" = "to_id"),relationship='many-to-many') |>
  mutate(
    reachable_10 = travel_time_p50 <= 10,
    reachable_20 = travel_time_p50 <= 20,
    reachable_30 = travel_time_p50 <= 30
  ) %>%
  st_as_sf(coords = c("longitude", "latitude"), crs = 4326)




ggplot() +
  geom_sf(data = nyc_map,fill ='#878999' ) + 
  geom_sf(data = public_spaces_geo, alpha = 0.2,color='black') +
  geom_sf(data = res |> filter(reachable_30), color = "#849324", size = 1) +
  geom_sf(data = res |> filter(reachable_20), color = '#FFB30F', size =1) + 
  geom_sf(data = res |> filter(reachable_10), color = '#FD151B', size = 1) + 
  geom_sf(data = sample_tract, color = "#437F97", size = 1) +
  theme_void() + 
  labs(
    title = "How Many Spaces Am I Close to?",
    subtitle = 'Walking + Transit (Bus,Subway) Isochrone-likes'
  )


#proof-of-concept, can do the same things as chris whong's subwaysheds isochrones,
#but we only care about public spaces.


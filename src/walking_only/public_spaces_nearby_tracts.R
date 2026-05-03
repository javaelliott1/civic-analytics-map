library(sf)
library(tidyverse)
library(nycgeo)
library(patchwork)
library(tidytransit)

options(java.parameters = '-Xmx10G')
library(r5r)

core <- r5r::build_network("data/subway_r5r_stuff/")
public_spaces <- read.csv("data/nyc-public-space.csv")
nyc_map <- nycgeo::nyc_boundaries("tract")

st_crs(nyc_map) <- st_crs(2263)
nyc_centroids <- nyc_map %>%
  st_centroid() %>%
  st_transform(4326)

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

res <- public_spaces |>
  select(space_id,type,longitude,latitude) |> 
  distinct() |> 
  left_join(tt, by = c("space_id" = "to_id")) |>
  mutate(
    reachable_10 = travel_time_p50 <= 10,
    reachable_20 = travel_time_p50 <= 20,
    reachable_30 = travel_time_p50 <= 30
  ) %>%
  st_as_sf(coords = c("longitude", "latitude"), crs = 4326) |>
  select(space_id,type,from_id,travel_time_p50,starts_with('reachable'),geometry)


#i want to show some types are more land-specific than others, i.e., emphasize pops
res |> 
  ggplot() + 
  geom_sf(data=nyc_map,alpha=.5) + 
  geom_sf(aes(color = type),size=0.5) + facet_wrap(. ~ type) + 
  theme_void()

# do fill by best tract 
plots <- lapply(c(10,20,30),function(min){
  tt |>
    as.data.frame() |>
    group_by(from_id) |> 
    summarise(n_spaces = n(),.groups='drop') |>
    mutate(max_30 = pmin(n_spaces,min)) |>
    right_join(nyc_map,by=c('from_id'='geoid')) |>
    st_as_sf() |>
    ggplot() +
    geom_sf(data=nyc_map) + 
    geom_sf(aes(fill=max_30)) + 
    scale_fill_gradientn(
      colors = c("#FF8427", "#FFC800", "#4D8B31"),
      name = paste0("Nearby Public Spaces 30 Cap")
    ) + 
    theme_void()
})


#per type?
#show what types are where





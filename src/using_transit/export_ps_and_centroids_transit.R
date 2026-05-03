library(sf)
library(tidyverse)
library(nycgeo)
library(r5r)

options(java.parameters = "-Xmx10G")

core <- r5r::build_network("data/subway_r5r_stuff/")
public_spaces <- read.csv("data/nyc-public-space.csv")
nyc_map <- nycgeo::nyc_boundaries("tract")

st_crs(nyc_map) <- st_crs(2263)
nyc_centroids <- nyc_map |>
  st_centroid() |>
  st_transform(4326)

destinations <- public_spaces |>
  st_as_sf(coords = c("longitude", "latitude"), crs = 4326) |>
  st_coordinates() |>
  as.data.frame() |>
  bind_cols(public_spaces) |>
  transmute(
    id = space_id,
    lon = X,
    lat = Y
  )

origin_points <- nyc_centroids |>
  st_coordinates() |>
  as.data.frame() |>
  bind_cols(nyc_centroids) |>
  transmute(
    id = geoid,
    lon = X,
    lat = Y
  )

travel_times <- travel_time_matrix(
  core,
  origins = origin_points,
  destinations = destinations,
  mode = c("WALK", "TRANSIT"),
  departure_datetime = as.POSIXct("2026-03-01 08:00:00"),
  max_trip_duration = 30
)

transit_ps_and_centroids <- public_spaces |>
  select(space_id, type) |>
  distinct() |>
  inner_join(travel_times, by = c("space_id" = "to_id")) |>
  transmute(
    geoid = from_id,
    space_id,
    type,
    min_walk = travel_time_p50
  )

write_csv(transit_ps_and_centroids, "data/transit_ps_and_centroids.csv")

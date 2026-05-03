library(sf)
library(tidyverse)
library(dotenv)
library(nycgeo)
library(patchwork)

load_dot_env()
public_spaces <- read.csv("data/nyc-public-space.csv")
public_spaces_geo <- st_read("data/nyc-public-space.geojson")
nyc_map <- nycgeo::nyc_boundaries("tract")


#transform to same type
st_crs(nyc_map) <- st_crs(2263)
ps_proj <- st_transform(public_spaces_geo, 2263)
nyc_land_boundaries <- nyc_boundaries()
st_crs(nyc_land_boundaries) <- 2263

#create a buffer zone around each tract ~ 20 min walk.
#3mph for 30min = 7920ft
#3mph for 20min = 5280ft
#3mph for 10min = 2640ft
naiive_walking_graph <- function(minute_walk){
  #avg_walk_speed = 3mph
  ft <- 3 * (minute_walk/60) * 5280
  nyc_buffers <- st_buffer(nyc_map, dist = ft) %>%
    st_intersection(nyc_boundaries())

  ps_counts <- st_join(
    nyc_buffers,
    ps_proj,
    join = st_contains
    ) %>% 
    count(geoid)

  #if you want to look at the buffers
  #ps_counts |>
  #  ggplot() + 
  #  geom_sf()
  dplyr::left_join(
    nyc_map,
    ps_counts %>% as.data.frame() %>% select(geoid,n),
    by = 'geoid'
  ) %>%
    mutate(capped_at_min = pmin(n,minute_walk)) %>%
    ggplot(aes(fill=capped_at_min)) + 
    geom_sf() + 
    scale_fill_gradientn(
      colors = c("#FF8427", "#FFC800", "#4D8B31"),  # red → yellow → green
      name = paste0("Nearby Public Spaces (",minute_walk,") Cap")
    ) + 
    theme_void() + 
    labs(
      title = "Visualizing Public Space Deserts for NYC",
      subtitle = paste0("Nearby Public Spaces for a ",minute_walk," min walk")
    )
}

#'somewhere to eat a sandwich for lunch'
#idea is 10 spaces for 10 minutes, 20 spaces for 20 minutes, 30 spaces for 30 minutes
naive.plots <- lapply(c(10,20,30),naiive_walking_graph)

naiive_walking_graph_by_type <- function(minute_walk,ps_type){
  #avg_walk_speed = 3mph
  ft <- 3 * (minute_walk/60) * 5280
  nyc_buffers <- st_buffer(nyc_map, dist = ft) %>%
    st_intersection(nyc_boundaries())

  ps_counts <- st_join(
    nyc_buffers,
    ps_proj %>% dplyr::filter(type == ps_type),
    join = st_contains
    ) %>% 
    count(geoid)

  #if you want to look at the buffers
  #ps_counts |>
  #  ggplot() + 
  #  geom_sf()
  dplyr::left_join(
    nyc_map,
    ps_counts %>% as.data.frame() %>% select(geoid,n),
    by = 'geoid'
  ) %>%
    mutate(capped_at_min = pmin(n,minute_walk)) %>%
    ggplot(aes(fill=capped_at_min)) + 
    geom_sf() + 
    scale_fill_gradientn(
      colors = c("#FF8427", "#FFC800", "#4D8B31"),  # red → yellow → green
      name = paste0("Nearby ",ps_type," (",minute_walk,") Cap")
    ) + 
    theme_void() + 
    labs(
      title = paste0("Visualizing ",ps_type," Deserts for NYC"),
      subtitle = paste0("Nearby ",ps_type," for a ",minute_walk," min walk")
    )
}

#what about looking at the type of spaces?
#types: 
# "park" "plaza" "pops"  
# "stp" schoolyard
# "misc" 
# "wpaa" waterfront access
mins <- 10
naive.bytype <- map(ps_proj$type |> unique(), ~ naiive_walking_graph_by_type(mins,.x))


#i think this tells enough of a story about 'places to eat a sandwich'
#and can speak on quality of that place. overall, i'd say it's a healthy spread.

#pt. 2; how distant are these spaces?

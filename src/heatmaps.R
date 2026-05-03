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
public_spaces <- read.csv("data/nyc-public-space.csv")
public_spaces_geo <- read_sf("data/nyc-public-space.geojson")
nyc_map <- nycgeo::nyc_boundaries("tract")

load_dot_env()
census_api_key(Sys.getenv("CENSUS_API_KEY"), install = FALSE)

nyc_acs <- read.csv('data/nyc_acs.csv')


#overlay to show placement of POPs
nyc_map |>
  left_join(
    nyc_acs |> 
      mutate(GEOID=as.character(GEOID)) |> 
      as.data.frame() |> select(-geometry),
    by=c('geoid'='GEOID')
) |> 
  mutate(
    across(c(demo_white,demo_black,demo_asian,demo_hispanic), ~ .x / demo_total_pop)
  ) |> 
  ggplot() + 
  geom_sf(aes(fill=scale(demo_median_income)[,1])) + 
  theme_void()

nyc_map |>
  left_join(
    nyc_acs |> 
      mutate(GEOID=as.character(GEOID)) |> 
      as.data.frame() |> select(-geometry),
    by=c('geoid'='GEOID')
) |> 
  mutate(
    across(c(demo_white,demo_black,demo_asian,demo_hispanic), ~ .x / demo_total_pop)
  ) |> 
  ggplot() + 
  geom_sf(aes(fill=scale(demo_median_income)[,1])) + 
  geom_sf(data = public_spaces_geo |> filter(type == 'pops'),size=0.75,color='#2ee0ff',alpha=0.5) +
  theme_void()

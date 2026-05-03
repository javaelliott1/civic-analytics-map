library(sf)
library(tidyverse)
library(nycgeo)
library(gganimate)

public_spaces <- read.csv('data/nyc-public-space.csv')
parks <- read.csv('data/nyc_parks.csv')
nyc_map <- nycgeo::nyc_boundaries("borough")

parks <- parks %>%
  st_as_sf(wkt = "multipolygon", crs = 4326) %>%
  rename(
    geometry = multipolygon
  ) |>
  mutate(
    ACQUISITIONDATE = ymd_hms(ACQUISITIONDATE)
  )


parks |> 
  ggplot() + 
  geom_sf(data=nyc_map,fill = '#FAEDCA') + 
  geom_sf(fill= '#7EBC89') + 
  coord_sf(expand = FALSE) +
  theme_void() + 
  theme(
    plot.background  = element_rect(fill = "#F2C078", color = NA),
    panel.background = element_rect(fill = "#F2C078", color = NA),
    plot.margin = margin(0,0,0,0),
    plot.title = element_text(color = "white"),
    plot.subtitle = element_text(color = "white")
  )


p <- parks |> 
  filter(!is.na(ACQUISITIONDATE)) |>
  ggplot() +
  geom_sf(data=nyc_map,fill='#FAEDCA') + 
  geom_sf(fill = "#7EBC89", color = NA, alpha = 0.9) +
  transition_time(floor_date(ACQUISITIONDATE, "year")) +
  shadow_mark(past = TRUE, future = FALSE) +
  labs(
    title = "Park Acquisitions Over Time",
    subtitle = "{frame_time}"
  ) +
  theme_void() + 
  theme(
    plot.background  = element_rect(fill = "#F2C078", color = NA),
    panel.background = element_rect(fill = "#F2C078", color = NA),
    plot.margin = margin(0,0,0,0),
    plot.title = element_text(color = "white"),
    plot.subtitle = element_text(color = "white")
  )

animate(
  p,
  duration = 20,
  fps = 8,
  width = 1200,
  height = 800,
  end_pause = 5,
  renderer = gifski_renderer("parks.gif")
)


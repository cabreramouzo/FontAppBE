[out:json][timeout:300];
area["ISO3166-1"="MX"][admin_level=2]->.mx;
(
  node["amenity"="drinking_water"](area.mx);
  node["natural"="spring"]["drinking_water"](area.mx);
  node["man_made"="water_tap"](area.mx);
);
out body;

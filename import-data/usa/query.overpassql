[out:json][timeout:900];
area["ISO3166-1"="US"][admin_level=2]->.no;
(
  node["amenity"="drinking_water"]["access"!~"^(no|private)$"](area.no)(18.8,-179.9,71.5,-66.8);
  node["man_made"="water_tap"]["access"!~"^(no|private)$"](area.no)(18.8,-179.9,71.5,-66.8);
  node["natural"="spring"]["drinking_water"]["access"!~"^(no|private)$"](area.no)(18.8,-179.9,71.5,-66.8);
  node["natural"="spring"]["name"]["access"!~"^(no|private)$"](area.no)(18.8,-179.9,71.5,-66.8);
  node["natural"="spring"]["man_made"]["access"!~"^(no|private)$"](area.no)(18.8,-179.9,71.5,-66.8);
);
out body;

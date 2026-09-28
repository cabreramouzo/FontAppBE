[out:json][timeout:900];
area["ISO3166-1"="BG"][admin_level=2]->.no;
(
  node["amenity"="drinking_water"]["access"!~"^(no|private)$"](area.no)(41.2,22.3,44.3,28.7);
  node["man_made"="water_tap"]["access"!~"^(no|private)$"](area.no)(41.2,22.3,44.3,28.7);
  node["natural"="spring"]["drinking_water"]["access"!~"^(no|private)$"](area.no)(41.2,22.3,44.3,28.7);
  node["natural"="spring"]["name"]["access"!~"^(no|private)$"](area.no)(41.2,22.3,44.3,28.7);
  node["natural"="spring"]["man_made"]["access"!~"^(no|private)$"](area.no)(41.2,22.3,44.3,28.7);
);
out body;

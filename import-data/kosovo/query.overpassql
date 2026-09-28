[out:json][timeout:900];
area["ISO3166-1"="XK"][admin_level=2]->.no;
(
  node["amenity"="drinking_water"]["access"!~"^(no|private)$"](area.no)(41.8,20.0,43.3,21.8);
  node["man_made"="water_tap"]["access"!~"^(no|private)$"](area.no)(41.8,20.0,43.3,21.8);
  node["natural"="spring"]["drinking_water"]["access"!~"^(no|private)$"](area.no)(41.8,20.0,43.3,21.8);
  node["natural"="spring"]["name"]["access"!~"^(no|private)$"](area.no)(41.8,20.0,43.3,21.8);
  node["natural"="spring"]["man_made"]["access"!~"^(no|private)$"](area.no)(41.8,20.0,43.3,21.8);
);
out body;

[out:json][timeout:540];
area["ISO3166-1"="FR"][admin_level=2]->.no;
(
  node["amenity"="drinking_water"]["access"!~"^(no|private)$"](area.no)(41.3,-5.3,51.2,9.7);
  node["man_made"="water_tap"]["access"!~"^(no|private)$"](area.no)(41.3,-5.3,51.2,9.7);
  node["natural"="spring"]["drinking_water"]["access"!~"^(no|private)$"](area.no)(41.3,-5.3,51.2,9.7);
  node["natural"="spring"]["name"]["access"!~"^(no|private)$"](area.no)(41.3,-5.3,51.2,9.7);
  node["natural"="spring"]["man_made"]["access"!~"^(no|private)$"](area.no)(41.3,-5.3,51.2,9.7);
);
out body;

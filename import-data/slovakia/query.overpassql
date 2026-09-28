[out:json][timeout:900];
area["ISO3166-1"="SK"][admin_level=2]->.no;
(
  node["amenity"="drinking_water"]["access"!~"^(no|private)$"](area.no)(47.7,16.8,49.7,22.6);
  node["man_made"="water_tap"]["access"!~"^(no|private)$"](area.no)(47.7,16.8,49.7,22.6);
  node["natural"="spring"]["drinking_water"]["access"!~"^(no|private)$"](area.no)(47.7,16.8,49.7,22.6);
  node["natural"="spring"]["name"]["access"!~"^(no|private)$"](area.no)(47.7,16.8,49.7,22.6);
  node["natural"="spring"]["man_made"]["access"!~"^(no|private)$"](area.no)(47.7,16.8,49.7,22.6);
);
out body;

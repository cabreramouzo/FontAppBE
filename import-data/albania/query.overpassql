[out:json][timeout:900];
area["ISO3166-1"="AL"][admin_level=2]->.no;
(
  node["amenity"="drinking_water"]["access"!~"^(no|private)$"](area.no)(39.6,19.2,42.7,21.1);
  node["man_made"="water_tap"]["access"!~"^(no|private)$"](area.no)(39.6,19.2,42.7,21.1);
  node["natural"="spring"]["drinking_water"]["access"!~"^(no|private)$"](area.no)(39.6,19.2,42.7,21.1);
  node["natural"="spring"]["name"]["access"!~"^(no|private)$"](area.no)(39.6,19.2,42.7,21.1);
  node["natural"="spring"]["man_made"]["access"!~"^(no|private)$"](area.no)(39.6,19.2,42.7,21.1);
);
out body;

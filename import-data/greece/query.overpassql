[out:json][timeout:900];
area["ISO3166-1"="GR"][admin_level=2]->.no;
(
  node["amenity"="drinking_water"]["access"!~"^(no|private)$"](area.no)(34.7,19.3,41.8,29.7);
  node["man_made"="water_tap"]["access"!~"^(no|private)$"](area.no)(34.7,19.3,41.8,29.7);
  node["natural"="spring"]["drinking_water"]["access"!~"^(no|private)$"](area.no)(34.7,19.3,41.8,29.7);
  node["natural"="spring"]["name"]["access"!~"^(no|private)$"](area.no)(34.7,19.3,41.8,29.7);
  node["natural"="spring"]["man_made"]["access"!~"^(no|private)$"](area.no)(34.7,19.3,41.8,29.7);
);
out body;

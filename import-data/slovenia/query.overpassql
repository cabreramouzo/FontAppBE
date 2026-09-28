[out:json][timeout:900];
area["ISO3166-1"="SI"][admin_level=2]->.no;
(
  node["amenity"="drinking_water"]["access"!~"^(no|private)$"](area.no)(45.4,13.3,46.9,16.7);
  node["man_made"="water_tap"]["access"!~"^(no|private)$"](area.no)(45.4,13.3,46.9,16.7);
  node["natural"="spring"]["drinking_water"]["access"!~"^(no|private)$"](area.no)(45.4,13.3,46.9,16.7);
  node["natural"="spring"]["name"]["access"!~"^(no|private)$"](area.no)(45.4,13.3,46.9,16.7);
  node["natural"="spring"]["man_made"]["access"!~"^(no|private)$"](area.no)(45.4,13.3,46.9,16.7);
);
out body;

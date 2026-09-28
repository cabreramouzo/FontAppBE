[out:json][timeout:900];
area["ISO3166-1"="HU"][admin_level=2]->.no;
(
  node["amenity"="drinking_water"]["access"!~"^(no|private)$"](area.no)(45.7,16.1,48.6,23.0);
  node["man_made"="water_tap"]["access"!~"^(no|private)$"](area.no)(45.7,16.1,48.6,23.0);
  node["natural"="spring"]["drinking_water"]["access"!~"^(no|private)$"](area.no)(45.7,16.1,48.6,23.0);
  node["natural"="spring"]["name"]["access"!~"^(no|private)$"](area.no)(45.7,16.1,48.6,23.0);
  node["natural"="spring"]["man_made"]["access"!~"^(no|private)$"](area.no)(45.7,16.1,48.6,23.0);
);
out body;

[out:json][timeout:900];
area["ISO3166-1"="DE"][admin_level=2]->.no;
(
  node["amenity"="drinking_water"]["access"!~"^(no|private)$"](area.no)(47.2,5.8,55.1,15.1);
  node["man_made"="water_tap"]["access"!~"^(no|private)$"](area.no)(47.2,5.8,55.1,15.1);
  node["natural"="spring"]["drinking_water"]["access"!~"^(no|private)$"](area.no)(47.2,5.8,55.1,15.1);
  node["natural"="spring"]["name"]["access"!~"^(no|private)$"](area.no)(47.2,5.8,55.1,15.1);
  node["natural"="spring"]["man_made"]["access"!~"^(no|private)$"](area.no)(47.2,5.8,55.1,15.1);
);
out body;

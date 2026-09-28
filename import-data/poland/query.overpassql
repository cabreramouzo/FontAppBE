[out:json][timeout:900];
area["ISO3166-1"="PL"][admin_level=2]->.no;
(
  node["amenity"="drinking_water"]["access"!~"^(no|private)$"](area.no)(49.0,14.1,54.9,24.2);
  node["man_made"="water_tap"]["access"!~"^(no|private)$"](area.no)(49.0,14.1,54.9,24.2);
  node["natural"="spring"]["drinking_water"]["access"!~"^(no|private)$"](area.no)(49.0,14.1,54.9,24.2);
  node["natural"="spring"]["name"]["access"!~"^(no|private)$"](area.no)(49.0,14.1,54.9,24.2);
  node["natural"="spring"]["man_made"]["access"!~"^(no|private)$"](area.no)(49.0,14.1,54.9,24.2);
);
out body;

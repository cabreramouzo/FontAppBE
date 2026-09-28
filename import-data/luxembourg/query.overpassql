[out:json][timeout:900];
area["ISO3166-1"="LU"][admin_level=2]->.no;
(
  node["amenity"="drinking_water"]["access"!~"^(no|private)$"](area.no)(49.4,5.7,50.2,6.6);
  node["man_made"="water_tap"]["access"!~"^(no|private)$"](area.no)(49.4,5.7,50.2,6.6);
  node["natural"="spring"]["drinking_water"]["access"!~"^(no|private)$"](area.no)(49.4,5.7,50.2,6.6);
  node["natural"="spring"]["name"]["access"!~"^(no|private)$"](area.no)(49.4,5.7,50.2,6.6);
  node["natural"="spring"]["man_made"]["access"!~"^(no|private)$"](area.no)(49.4,5.7,50.2,6.6);
);
out body;

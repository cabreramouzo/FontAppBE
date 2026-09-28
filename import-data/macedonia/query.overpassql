[out:json][timeout:900];
area["ISO3166-1"="MK"][admin_level=2]->.no;
(
  node["amenity"="drinking_water"]["access"!~"^(no|private)$"](area.no)(40.8,20.4,42.4,23.1);
  node["man_made"="water_tap"]["access"!~"^(no|private)$"](area.no)(40.8,20.4,42.4,23.1);
  node["natural"="spring"]["drinking_water"]["access"!~"^(no|private)$"](area.no)(40.8,20.4,42.4,23.1);
  node["natural"="spring"]["name"]["access"!~"^(no|private)$"](area.no)(40.8,20.4,42.4,23.1);
  node["natural"="spring"]["man_made"]["access"!~"^(no|private)$"](area.no)(40.8,20.4,42.4,23.1);
);
out body;

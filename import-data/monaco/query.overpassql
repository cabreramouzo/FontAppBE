[out:json][timeout:900];
area["ISO3166-1"="MC"][admin_level=2]->.no;
(
  node["amenity"="drinking_water"]["access"!~"^(no|private)$"](area.no)(43.72,7.40,43.76,7.45);
  node["man_made"="water_tap"]["access"!~"^(no|private)$"](area.no)(43.72,7.40,43.76,7.45);
  node["natural"="spring"]["drinking_water"]["access"!~"^(no|private)$"](area.no)(43.72,7.40,43.76,7.45);
  node["natural"="spring"]["name"]["access"!~"^(no|private)$"](area.no)(43.72,7.40,43.76,7.45);
  node["natural"="spring"]["man_made"]["access"!~"^(no|private)$"](area.no)(43.72,7.40,43.76,7.45);
);
out body;

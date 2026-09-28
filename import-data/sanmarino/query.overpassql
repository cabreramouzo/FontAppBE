[out:json][timeout:900];
area["ISO3166-1"="SM"][admin_level=2]->.no;
(
  node["amenity"="drinking_water"]["access"!~"^(no|private)$"](area.no)(43.89,12.40,44.0,12.52);
  node["man_made"="water_tap"]["access"!~"^(no|private)$"](area.no)(43.89,12.40,44.0,12.52);
  node["natural"="spring"]["drinking_water"]["access"!~"^(no|private)$"](area.no)(43.89,12.40,44.0,12.52);
  node["natural"="spring"]["name"]["access"!~"^(no|private)$"](area.no)(43.89,12.40,44.0,12.52);
  node["natural"="spring"]["man_made"]["access"!~"^(no|private)$"](area.no)(43.89,12.40,44.0,12.52);
);
out body;

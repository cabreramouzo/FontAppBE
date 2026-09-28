[out:json][timeout:900];
area["ISO3166-1"="LT"][admin_level=2]->.no;
(
  node["amenity"="drinking_water"]["access"!~"^(no|private)$"](area.no)(53.8,20.9,56.5,26.9);
  node["man_made"="water_tap"]["access"!~"^(no|private)$"](area.no)(53.8,20.9,56.5,26.9);
  node["natural"="spring"]["drinking_water"]["access"!~"^(no|private)$"](area.no)(53.8,20.9,56.5,26.9);
  node["natural"="spring"]["name"]["access"!~"^(no|private)$"](area.no)(53.8,20.9,56.5,26.9);
  node["natural"="spring"]["man_made"]["access"!~"^(no|private)$"](area.no)(53.8,20.9,56.5,26.9);
);
out body;


# API Definitions

## Endpoints

### Users management
* `POST /users` Para registrar un nuevo usuario.
* `GET /users/{id}` Para obtener la información de un usuario específico.
* `PUT /users/{id}` Para actualizar la información de un usuario específico.
* `DELETE /users/{id}` Para eliminar un usuario específico.

### Fonts management
* `POST /fonts` Para crear una nueva fuente.
* `GET /fonts/{id}` Para obtener la información de una fuente específica.
* `PUT /fonts/{id}` Para actualizar la información de una fuente específica.
* `DELETE /fonts/{id}` Para eliminar una fuente específica.

### Get near Fonts
* `GET /fonts/near?lat={latitude}&long={longitude}&quantity={Nfonts}`: Para obtener Nfonts en las coordenadas especificadas.

### Get near Fonts offline
* `GET /fonts/near/download?lat={latitude}&long={longitude}&quantity={Nfonts}`: Para obtener Nfonts en las coordenadas especificadas.

#### Fonts problem management

* `POST /fuentes/{id}/report` Para informar de un problema en una fuente específica.
* `GET /fuentes/{id}/report` Para obtener la lista de problemas informados en una

#### Fonts comments management

* `POST /fuentes/{id}/comments` Para hacer un comentario en una fuente específica.
* `GET /fuentes/{id}/comments` Para obtener la lista de comentarios en una fuente específica.
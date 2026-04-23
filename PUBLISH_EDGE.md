# Publicar en Microsoft Edge Add-ons

## 1. Registrarse

- Ir a https://partner.microsoft.com/dashboard/microsoftedge/public/login
- Iniciar sesión con tu cuenta de Microsoft (la de Macropay funciona)
- Aceptar los términos de desarrollador

## 2. Subir la extensión

- En el dashboard, click en **"Create new extension"**
- Subir el archivo `supportplus-extension.zip`
- Esperar a que se valide

## 3. Datos a llenar

### Información básica

- **Nombre:** SupportPlus DBA Tools
- **Descripción corta:** Herramientas de productividad para el equipo DBA en SupportPlus y Monday.com
- **Descripción larga:**

```
Extensión interna para el equipo de Infraestructura DBA de Macropay.

Funcionalidades principales:

- Migración de tickets cerrados a Monday.com (individual y masiva)
- Tomar tickets en espera con un click
- Cerrar tickets con opción de migrar a Monday en un solo paso
- Robar tickets asignados a otros analistas
- Búsqueda personalizada con filtros avanzados
- Indicador visual de tickets propios
- Colores por estado de ticket
- Validación de duplicados antes de migrar
- Sincronización automática con Monday.com
- Notificaciones toast para todas las acciones
- Botón de nuevo ticket rápido
- Soporte para vista de lista, detalle y búsqueda

Configuración:
1. Click en el ícono de la extensión
2. Pegar el API Token de Monday.com
3. Seleccionar el board destino
4. Listo, los botones aparecen automáticamente en SupportPlus
```

### Categoría

- **Categoría:** Productivity

### Privacidad

- **Sitios web accedidos:**
  - macropay.supportplus.mx
  - macropayapi.supportplus.mx
  - api.monday.com
- **Permisos:** activeTab, scripting, storage
- **Política de privacidad:** No recopila datos personales. Los tokens se almacenan localmente en el navegador del usuario.

### Visibilidad

- Seleccionar **"Public"** si quieres que cualquiera lo encuentre
- O **"Hidden"** si solo quieres compartir el link directo con tu equipo (recomendado)

### Capturas de pantalla

- Necesitas al menos 1 captura de 1280x800 o 640x400
- Recomendado: captura de la tabla con los botones de acción visibles

## 4. Publicar

- Click en **"Publish"**
- Microsoft revisa en 1-2 días hábiles
- Recibirás un email cuando esté aprobada
- El link para instalar se genera automáticamente

## 5. Actualizar

- En el dashboard, ir a tu extensión
- Click en **"Update"**
- Subir el nuevo ZIP
- Se revisa y publica automáticamente

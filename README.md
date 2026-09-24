# Prueba de automatización: comandos de PowerShell

Guía de los comandos utilizados para preparar, ejecutar y verificar la solución de reabastecimiento con JavaScript y Node.js en Windows.

Los comandos se ejecutan en PowerShell, no dentro de `catalogo.js`. No se incluyen aquí los bloques de persistencia de `WEBHOOK_URL` ni de registro de la tarea programada, según lo solicitado. Si esos bloques están guardados como comentarios en el código, sirven como referencia: para que tengan efecto deben ejecutarse en PowerShell.

## 1. Verificar Node.js

```powershell
node --version
```

Durante el desarrollo se utilizó Node.js `v20.17.0`, que incluye `fetch`. El proyecto no requiere instalar paquetes con npm.

## 2. Crear la carpeta del proyecto

Solo para la preparación inicial; omitir si la carpeta ya existe.

```powershell
cd $HOME
mkdir prueba-automatizacion
cd prueba-automatizacion
```

Para volver a entrar a una carpeta ya creada:

```powershell
cd "$HOME\prueba-automatizacion"
```

`$HOME` representa la carpeta del usuario actual de Windows. Si el proyecto se guardó en otra ubicación, utilizar esa ruta.

## 3. Crear o editar el archivo JavaScript

```powershell
notepad catalogo.js
```

Pegar el código de la solución y guardar con Ctrl + S. Comprobar que el archivo se llama `catalogo.js`, sin una extensión `.txt` adicional.

## 4. Configurar el webhook para una ejecución manual

Abrir https://webhook.site/ y copiar el valor **Your unique URL**. Sustituir el marcador por esa dirección:

```powershell
$env:WEBHOOK_URL = "PEGA_AQUI_TU_URL"
```

Esta variable está disponible en la sesión actual de PowerShell y en los procesos que se inicien desde ella. No persiste al cerrar la ventana. La persistencia para la tarea programada se configura mediante el bloque separado, omitido de este README.

## 5. Ejecutar manualmente

Desde la carpeta del proyecto y en la misma sesión donde se configuró la URL:

```powershell
node catalogo.js
```

El programa consulta el catálogo, calcula las prioridades y envía un único mensaje al webhook. Cada nueva ejecución realiza un nuevo envío.

Con el catálogo utilizado durante el desarrollo se obtuvieron:

- 194 productos analizados.
- 48 productos con stock bajo.
- 5 productos prioritarios.
- 43 productos adicionales pendientes de revisión.

Las cantidades pueden cambiar si cambia el catálogo. Comprobar que aparece `Mensaje enviado correctamente al webhook.` y que Webhook.site recibe una petición POST con el mensaje completo.

## 6. Crear o editar el ejecutor de la tarea

```powershell
notepad ejecutar.ps1
```

Guardar aquí el script de PowerShell que carga la variable de usuario, ejecuta `catalogo.js` y registra la salida en `ejecuciones.log`. Este comando solo abre el editor: no ejecuta ni programa la tarea.

## 7. Probar la tarea programada

Requiere haber ejecutado previamente los dos bloques de configuración omitidos: persistencia de la URL y registro de `AlertaReabastecimiento`.

```powershell
Start-ScheduledTask -TaskName "AlertaReabastecimiento"
```

Inicia la tarea sin esperar al horario diario. También genera un nuevo envío al webhook. Esperar unos segundos antes de consultar el resultado.

## 8. Consultar el resultado y la próxima ejecución

```powershell
Get-ScheduledTaskInfo -TaskName "AlertaReabastecimiento" |
    Select-Object LastRunTime, LastTaskResult, NextRunTime
```

- `LastRunTime`: momento de la última ejecución.
- `LastTaskResult`: debe ser `0` al finalizar correctamente.
- `NextRunTime`: siguiente ejecución prevista; con la configuración propuesta, a las 09:00 según la hora de Windows.

Comprobar también el registro y la recepción en Webhook.site.

## 9. Revisar el registro

Desde la carpeta del proyecto:

```powershell
Get-Content .\ejecuciones.log -Tail 15
```

Muestra las últimas 15 líneas. Una ejecución correcta mediante `ejecutar.ps1` debe registrar:

```text
Mensaje enviado correctamente al webhook.
Fin. Codigo: 0
```

El archivo de registro lo genera `ejecutar.ps1`; ejecutar directamente `node catalogo.js` muestra la salida en la terminal.

## Condiciones de ejecución diaria

La tarea configurada requiere el equipo encendido, conexión a internet y la sesión del usuario iniciada; la sesión puede estar bloqueada. La URL de Webhook.site debe seguir vigente. Esta guía documenta cómo verificar la programación, pero su funcionamiento debe confirmarse con una ejecución real.

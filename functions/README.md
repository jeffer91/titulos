# Bloque 1 de 6: backend de seguridad ITSQMET

Cuatro entradas independientes de Firebase Cloud Functions v2:
- estudiantesApi: rol estudiante
- coordinadoresApi: rol coordinador
- investigadoresApi: rol investigador
- administradoresApi: rol administrador

Cada módulo reside en functions/modules y comparte exclusivamente la verificación de sesión en servidor desde functions/shared.

## Disponible

GET /salud responde sin autenticación ni datos personales.
GET /sesion exige el token Firebase Auth y comprueba en servidor verifyIdToken(token, true), incluidas revocaciones. El rol autorizado procede de custom claims roles o role emitidos por Firebase Admin, nunca de un PIN, cédula, cabecera de rol ni parámetro del frontend.

CORS admite sólo orígenes exactos; GitHub Pages https://jeffer91.github.io está permitido. Orígenes locales pueden configurarse con CORS_ORIGINS. CORS no es un sistema de autenticación.

Cualquier otra operación es denegada por defecto. La identidad de servicio proviene del entorno Google Cloud, no de un archivo service_account publicado.

## IMPORTANTE: integración pendiente

No se desplegaron las funciones ni se modificaron reglas reales. Los cuatro frontends actuales siguen conectados por el SDK Firestore del navegador. Por tanto, **esta nueva API todavía NO asegura los flujos existentes**. Los bloques 2, 3, 4 y 5 migrarán consultas/escrituras y autenticarán cada módulo; el bloque 6 validará las reglas de Firestore reales y desactivará acceso directo a documentos sensibles.

Conocer una cédula no prueba la identidad del estudiante. Un PIN local tampoco autentica al investigador ante el backend. Electron desde file:// necesitará una solución segura distinta de aceptar Origin: null.

Claves IA y tokens Google Sheets heredados permanecen expuestos a navegadores mientras no se trasladen a Secret Manager y endpoints del servidor. Esto es una deuda crítica de migración, no debe darse por resuelta con este commit.

## Prueba y despliegue posterior

Se requiere Node.js 22, Firebase CLI, proyecto correcto y facturación admitida para Cloud Functions v2.

    npm --prefix functions install
    npm --prefix functions test

Cuando se verifique el proyecto y se autorice despliegue:

    firebase deploy --only functions:estudiantesApi,functions:coordinadoresApi,functions:investigadoresApi,functions:administradoresApi --project titulos-ec2fa

Asignar roles mediante Firebase Admin SDK setCustomUserClaims desde un entorno administrativo confiable, preservando otros claims y revocando sesiones cuando corresponda. Nunca asignar roles desde JavaScript del navegador.

NO desplegar firestore.rules.example hasta finalizar la migración: niega todas las lecturas y escrituras, y rompería los clientes actuales.

Si alguna credencial de cuenta de servicio se divulgó, rotarla y revocarla en Google Cloud; su eliminación de mensajes/archivos no revoca privilegios.

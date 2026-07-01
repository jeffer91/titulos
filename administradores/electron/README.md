# Instalador Electron - Administradores

Este bloque prepara el instalador independiente del módulo administradores.

## Requisitos

Tener Node.js instalado en la computadora.

## Probar en modo escritorio

Desde la carpeta:

```text
administradores/electron
```

Ejecutar:

```bash
npm install
npm start
```

## Generar instalador de Windows

```bash
npm run dist
```

## Generar versión portable

```bash
npm run dist:portable
```

## Pantallas incluidas

```text
administradores/administrador.html
administradores/coordinadores.html
administradores/reportes.html
```

## Importante

Este instalador es solo para administradores. El instalador de coordinadores es independiente.

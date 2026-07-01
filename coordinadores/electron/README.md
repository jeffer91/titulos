# Instalador Electron - Coordinadores

Este bloque prepara el instalador independiente del módulo coordinadores.

## Requisitos

Tener Node.js instalado en la computadora.

## Probar en modo escritorio

Desde la carpeta:

```text
coordinadores/electron
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
coordinadores/coordinador.html
coordinadores/revision.html
```

## Importante

Este instalador es solo para coordinadores. El instalador de administradores se construye aparte.

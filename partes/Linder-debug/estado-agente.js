import {
  chmodSync, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync,
  openSync, readFileSync, renameSync, rmdirSync, writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

export const NETWORK = "stellar:testnet";
export const HORIZON = "https://horizon-testnet.stellar.org";
export const RPC = "https://soroban-testnet.stellar.org";
export const ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
export const CONTRACT = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
export const BUDGET = 500000n; // 0.05 USDC.
export const DIRECTORY = ".codigo402-agente";

export function errorSeguro(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

// Valores decimales exactos, sin redondear con Number.
export function unidades(value) {
  if (!/^\d+(\.\d{1,7})?$/.test(value)) {
    throw errorSeguro("IMPORTE_INVALIDO");
  }
  const [integer, fraction = ""] = value.split(".");
  return BigInt(integer) * 10000000n + BigInt(fraction.padEnd(7, "0"));
}

export function leerEstado(name, fallback) {
  const file = `${DIRECTORY}/${name}.json`;
  if (!existsSync(file)) return fallback;
  // Los errores de lectura o JSON corrupto detienen la operación.
  return JSON.parse(readFileSync(file, "utf8"));
}

export function guardarArchivo(file, contents) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  const fd = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(fd, contents, "utf8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, file);
  const directory = openSync(resolve(file, ".."), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

export function guardarEstado(name, data) {
  guardarArchivo(`${DIRECTORY}/${name}.json`, JSON.stringify(data, null, 2));
}

export async function conBloqueo(work) {
  const prefix = execFileSync("git", ["rev-parse", "--show-prefix"], {
    encoding: "utf8",
  }).trim();
  if (prefix !== "partes/Linder-debug/") throw errorSeguro("ABRIR_PARTES_LINDER_DEBUG");
  const tracked = execFileSync("git", ["ls-files", "--", ".env", DIRECTORY], {
    encoding: "utf8",
  });
  if (tracked.trim()) throw errorSeguro("ARCHIVOS_PRIVADOS_RASTREADOS_POR_GIT");
  execFileSync("git", ["check-ignore", "-q", "--", ".env"]);
  execFileSync("git", ["check-ignore", "-q", "--", `${DIRECTORY}/estado.json`]);
  if (!lstatSync(".env").isFile()) throw errorSeguro("ENV_DEBE_SER_ARCHIVO_REGULAR");
  chmodSync(".env", 0o600);
  mkdirSync(DIRECTORY, { recursive: true, mode: 0o700 });
  if (!lstatSync(DIRECTORY).isDirectory() || lstatSync(DIRECTORY).isSymbolicLink()) {
    throw errorSeguro("DIRECTORIO_PRIVADO_INVALIDO");
  }
  chmodSync(DIRECTORY, 0o700);
  const lock = `${DIRECTORY}/bloqueo`;
  try { mkdirSync(lock, { mode: 0o700 }); }
  catch { throw errorSeguro("BLOQUEO_EXISTENTE_REVISAR_PROCESO_ANTES_DE_CONTINUAR"); }
  try {
    const contents = readFileSync(".env", "utf8");
    const env = parseEnv(contents);
    const keys = [...contents.matchAll(/^\s*(?:export\s+)?(AGENTE_PUBLICA|AGENTE_SECRETA)\s*=/gm)];
    for (const name of ["AGENTE_PUBLICA", "AGENTE_SECRETA"]) {
      if (keys.filter((match) => match[1] === name).length > 1) {
        throw errorSeguro("CLAVES_AGENTE_DUPLICADAS_EN_ENV");
      }
    }
    return await work(env, contents);
  } finally {
    rmdirSync(lock);
  }
}

export function reportarError(error) {
  console.error("Detenido:", error.code ?? "ERROR_NO_CONFIRMADO_REVISAR_ESTADO");
  // Evita imprimir objetos SDK con XDR, claves o solicitudes firmadas.
  process.exitCode = 1;
}

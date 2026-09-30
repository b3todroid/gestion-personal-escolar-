import { describe, expect, it } from "vitest";
import { cellId, findConflicts, type Cell } from "./schedule";
import { parseCsv, toCsv } from "./csv";

const cell = (o: Partial<Cell>): Cell => ({ id: "x", staffId: "maria", weekday: 2, periodId: "p3", groupId: "2A", allowShared: false, ...o });

describe("findConflicts", () => {
  it("sin choques en periodos distintos", () => {
    expect(findConflicts([cell({ id: "a", periodId: "p1" })], cell({ id: "b" }))).toEqual([]);
  });
  it("misma persona, mismo día y periodo = choque", () => {
    const r = findConflicts([cell({ id: "a", groupId: "1B" })], cell({ id: "b" }));
    expect(r.map((c) => c.kind)).toEqual(["staff_busy"]);
  });
  it("mismo grupo con otro docente = choque, salvo que sea compartido", () => {
    const other = cell({ id: "a", staffId: "juan" });
    expect(findConflicts([other], cell({ id: "b" })).map((c) => c.kind)).toEqual(["group_busy"]);
    expect(findConflicts([other], cell({ id: "b", allowShared: true }))).toEqual([]);
    expect(findConflicts([{ ...other, allowShared: true }], cell({ id: "b" }))).toEqual([]);
  });
  it("editar la misma celda no choca consigo misma", () => {
    expect(findConflicts([cell({ id: "a" })], cell({ id: "a", groupId: "3C" }))).toEqual([]);
  });
  it("actividades sin grupo no chocan por grupo", () => {
    expect(findConflicts([cell({ id: "a", staffId: "juan", groupId: "" })], cell({ id: "b", groupId: "" }))).toEqual([]);
  });
  it("cellId es estable", () => {
    expect(cellId("y", "s", 1, "p")).toBe("y:s:1:p");
  });
});

describe("csv", () => {
  it("lee comas, comillas, BOM y saltos de Windows", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","di ""hola"""\r\n')).toEqual([["a", "b"], ["x, y", 'di "hola"']]);
  });
  it("detecta punto y coma (Excel en español)", () => {
    expect(parseCsv("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("ignora líneas vacías y hace ida y vuelta", () => {
    const rows = [["docente", "nota"], ["López, María", 'dice "sí"']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
    expect(parseCsv("a,b\n\n\n")).toEqual([["a", "b"]]);
  });
});

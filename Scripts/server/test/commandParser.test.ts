import { describe, it, expect } from "vitest";
import { parseTeamCommand } from "../src/commandParser.js";

describe("parseTeamCommand", () => {
  it("reconhece 13 como VERMELHO", () => {
    expect(parseTeamCommand("13")).toBe("VERMELHO");
  });

  it("reconhece 22 como AZUL", () => {
    expect(parseTeamCommand("22")).toBe("AZUL");
  });

  it("normaliza espacos nas bordas e internos", () => {
    expect(parseTeamCommand("  13  ")).toBe("VERMELHO");
    expect(parseTeamCommand(" 2 2 ")).toBe("AZUL");
  });

  it("nao conta substrings como 113 ou 220", () => {
    expect(parseTeamCommand("113")).toBeNull();
    expect(parseTeamCommand("220")).toBeNull();
    expect(parseTeamCommand("130")).toBeNull();
  });

  it("ignora comentarios sem relacao", () => {
    expect(parseTeamCommand("vai time azul")).toBeNull();
    expect(parseTeamCommand("")).toBeNull();
  });
});

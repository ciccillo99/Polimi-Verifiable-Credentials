import { generateVerifierCircuitInputs } from "../helpers";
const path = require("path");
const fs = require("fs");
const snarkjs = require("snarkjs");
const wasm_tester = require("circom_tester").wasm;

describe("Verifier Circuit Test with Proof Generation", function () {
  jest.setTimeout(30 * 60 * 1000); // 10 minuti

  let rawEmail: Buffer;
  let circuit: any;

  const CIRCUIT_NAME = "main"; // Assicurati che il nome del circuito sia corretto
  const BUILD_DIR = path.join(__dirname, "../build");
  const OUTPUT_DIR = path.join(__dirname, "../proofs");

  beforeAll(async () => {
    rawEmail = fs.readFileSync(
      path.join(__dirname, "./emls/email-test.eml"), // Percorso corretto del file di test
      "utf8"
    );

    circuit = await wasm_tester(path.join(__dirname, "../src/main.circom"), {
      recompile: true,
      output: path.join(__dirname, "../build/output"),
      include: [path.join(__dirname, "../node_modules"), path.join(__dirname, "../../../node_modules")],
    });

    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR);
    }
  });

  async function testWithEmail() {
    // Genera gli input per il circuito a partire dal file email
    const ethereumAddress = "0x3773fd7b2a9CF6FF3E3EfD82Bd30536E11e83b6f"; // Puoi passare l'indirizzo Ethereum se necessario
    const circuitInputs = await generateVerifierCircuitInputs(rawEmail, ethereumAddress);

    console.log("Circuit Inputs:", circuitInputs);
    // Calcola il witness
    const witness = await circuit.calculateWitness(circuitInputs);
    console.log("Witness calculated");
    await circuit.checkConstraints(witness);
    console.log("Costraint checked");
    // Carica i simboli del circuito
    await circuit.loadSymbols();
    console.log("Symbols loaded");

    // Estrazione di variabili interne per verificare gli output
    const fromIndex = circuit.symbols["main.fromEmailIndex"].varIdx;
    console.log("fromEmailIndex: ", witness[fromIndex]);

    const nomeIndex = circuit.symbols["main.nomeIndex"].varIdx;
    console.log("nomeIndex: ", witness[nomeIndex]);

    const dataIndex = circuit.symbols["main.dataIndex"].varIdx;
    console.log("dataIndex: ", witness[dataIndex]);

    const IUVIndex = circuit.symbols["main.IUVIndex"].varIdx;
    console.log("IUVIndex: ", witness[IUVIndex]);

    const importoIndex = circuit.symbols["main.importoIndex"].varIdx;
    console.log("importoIndex: ", witness[importoIndex]);

    const matricolaIndex = circuit.symbols["main.matricolaIndex"].varIdx;
    console.log("matricolaIndex: ", witness[matricolaIndex]);

    // Genera la prova e verifica la validità
    const wasm = fs.readFileSync(
      path.join(BUILD_DIR, `${CIRCUIT_NAME}_js/${CIRCUIT_NAME}.wasm`)
    );
    const wc = require(path.join(BUILD_DIR, `${CIRCUIT_NAME}_js/witness_calculator.js`));
    const witnessCalculator = await wc(wasm);
    const buff = await witnessCalculator.calculateWTNSBin(circuitInputs, 0);
    fs.writeFileSync(path.join(OUTPUT_DIR, `input.wtns`), buff);

    const { proof, publicSignals } = await snarkjs.groth16.prove(
      path.join(BUILD_DIR, `${CIRCUIT_NAME}.zkey`),
      path.join(OUTPUT_DIR, `input.wtns`)
    );

    fs.writeFileSync(
      path.join(OUTPUT_DIR, `proof.json`),
      JSON.stringify(proof, null, 2)
    );
    fs.writeFileSync(
      path.join(OUTPUT_DIR, `public.json`),
      JSON.stringify(publicSignals, null, 2)
    );

    const vkey = JSON.parse(fs.readFileSync(path.join(BUILD_DIR, `artifacts/${CIRCUIT_NAME}.vkey.json`)).toString());
    const proofVerified = await snarkjs.groth16.verify(vkey, publicSignals, proof);
    expect(proofVerified).toBe(true);
  }

  // Esegue il test con l'email di input
  it(`should validate email and generate proof`, async function () {
    await testWithEmail();
  });
});

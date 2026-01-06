"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express")); // <-- popravljeno
const cors_1 = __importDefault(require("cors"));
const db_1 = require("./db");
const mssql_1 = __importDefault(require("mssql"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.get('/api/kupec', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const pool = yield db_1.poolPromise;
        const result = yield pool.request().query(`
      SELECT KupecID, Naziv, Naslov, Posta, Kraj, Telefon, Fax, IDzaDDV FROM dbo.Kupec
    `);
        res.json(result.recordset);
    }
    catch (err) {
        res.status(500).json({ error: 'Napaka pri pridobivanju kupcev', details: err });
    }
}));
app.post('/api/delovni-nalog', function (req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { kupecID, kontaktnaOseba, email, komentar, rokIzdelave } = req.body;
            const pool = yield db_1.poolPromise;
            const kupecResult = yield pool.request()
                .input('kupecID', mssql_1.default.Int, kupecID)
                .query('SELECT * FROM dbo.Kupec WHERE KupecID = @kupecID');
            const kupec = kupecResult.recordset[0];
            if (!kupec) {
                return res.status(404).json({ error: 'Kupec ni bil najden' });
            }
            const datumOdprtja = new Date();
            const stevilkaNaloga = `DN-${Date.now()}`;
            const delovniNalog = {
                stevilkaNaloga,
                kupec,
                kontaktnaOseba,
                email,
                komentar,
                rokIzdelave,
                datumOdprtja,
            };
            res.json({ message: 'Delovni nalog pripravljen', delovniNalog });
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Napaka pri obdelavi delovnega naloga', details: err });
        }
    });
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});

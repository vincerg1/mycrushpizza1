require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const PORT = process.env.PORT || 8080;
const app = express();


console.log("🔍 Verificando variables de entorno en Railway:");
console.log("DATABASE_URL:", process.env.MYSQL_URL);

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
});

app.use(cors());
app.use(express.json());

db.connect(err => {
    if (err) {
        console.error('❌ Error conectando a MySQL:', err);
        return;
    }
    console.log('✅ Conectado a MySQL');
});
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});

/*index.js1*/
app.get('/', (req, res) => {
    res.send('Servidor funcionando correctamente 🚀');
});
app.get('/lista-ganadores', (req, res) => {
    db.query("SELECT id, numero FROM ganador WHERE reclamado = 1 AND entregado = 0 ORDER BY id DESC", 
    (err, result) => {
        if (err) return res.status(500).json(err);
        res.json(result);
    });
});
app.get('/verificar/:numero', (req, res) => {
    const { numero } = req.params;
    db.query("SELECT numero, reclamado, entregado, contacto FROM ganador WHERE numero = ? AND reclamado = 1", 
    [numero], (err, result) => {
        if (err) return res.status(500).json(err);
        if (result.length === 0) return res.status(404).json({ message: "Número no encontrado o aún no ha sido reclamado" });

        res.json(result[0]);
    });
});
app.get('/ganador', (req, res) => {
    db.query("SELECT numero FROM ganador ORDER BY id DESC LIMIT 1", (err, result) => {
        if (err) {
          console.error("Error en /ganador:", err);  // Aquí sí se imprime en consola
          return res.status(500).json(err);          // Luego devuelves la respuesta
        }
      
        if (result.length > 0) {
          res.json({ numeroGanador: result[0].numero });
        } else {
          res.status(400).json({ message: 'No hay número ganador generado aún' });
        }
      });
});
app.post('/generar-ganador', (req, res) => {
    const numeroGanador = Math.floor(Math.random() * 900) + 100; // Ahora de 100 a 999
    db.query("INSERT INTO ganador (numero, reclamado) VALUES (?, false)", [numeroGanador], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: 'Número ganador generado 🎉', numeroGanador });
    });
});
app.post('/intentar', (req, res) => {
    const numeroAleatorio = Math.floor(Math.random() * 900) + 100; // Ahora de 100 a 999
    db.query("SELECT numero FROM ganador ORDER BY id DESC LIMIT 1", (err, result) => {
        if (err) return res.status(500).json(err);
        
        if (result.length > 0) {
            const numeroGanador = result[0].numero;
            const esGanador = numeroAleatorio === numeroGanador;

            res.json({ 
                intento: numeroAleatorio, 
                numeroGanador, 
                esGanador 
            });
        } else {
            res.status(400).json({ message: 'No hay número ganador generado aún' });
        }
    });
});
app.post('/reclamar', (req, res) => {
    const { contacto } = req.body;  // Recibe el número de contacto del usuario

    // Buscar el número ganador actual que aún no ha sido reclamado
    db.query("SELECT id FROM ganador WHERE reclamado = false ORDER BY id DESC LIMIT 1", (err, result) => {
        if (err) return res.status(500).json(err);

        if (result.length > 0) {
            const ganadorId = result[0].id;

            // Marcar el número como reclamado, guardar el número de contacto y registrar el timestamp de reclamo
            db.query(`
                UPDATE ganador 
                SET reclamado = true, 
                    contacto = ?, 
                    reclamado_en = CURRENT_TIMESTAMP 
                WHERE id = ?`, 
            [contacto, ganadorId], (err, updateResult) => {
                if (err) return res.status(500).json(err);

                // Generar automáticamente un nuevo número ganador de 3 dígitos (100 a 999)
                const nuevoNumeroGanador = Math.floor(Math.random() * 900) + 100; // Ahora entre 100 y 999

                db.query("INSERT INTO ganador (numero, reclamado) VALUES (?, false)", [nuevoNumeroGanador], (err, insertResult) => {
                    if (err) return res.status(500).json(err);

                    res.json({ message: 'Premio reclamado, fecha registrada y nuevo número de 3 dígitos generado 🎉', nuevoNumeroGanador });
                });
            });
        } else {
            res.status(400).json({ message: 'No hay número ganador activo para reclamar' });
        }
    });
});
app.post('/actualizar-entrega', (req, res) => {
    const { numero } = req.body;
    db.query("UPDATE ganador SET entregado = 1 WHERE numero = ?", [numero], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Premio marcado como entregado ✔" });
    });
});


// intetar prueba// 
// app.post('/intentar', (req, res) => {
//     db.query("SELECT numero FROM ganador ORDER BY id DESC LIMIT 1", (err, result) => {
//         if (err) return res.status(500).json(err);

//         if (result.length > 0) {
//             const numeroGanador = result[0].numero;
//             const numeroAleatorio = numeroGanador; // 🔥 Fuerza que siempre gane

//             res.json({ intento: numeroAleatorio, numeroGanador, esGanador: true });
//         } else {
//             res.status(400).json({ message: 'No hay número ganador generado aún' });
//         }
//     });
// });





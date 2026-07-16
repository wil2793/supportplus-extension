require("dotenv").config();
const express = require("express");
const cors = require("cors");
const auth = require("./middleware/auth");
const errorHandler = require("./middleware/error-handler");

const app = express();
const PORT = process.env.PORT || 3500;

// Middleware
app.use(cors());
app.use(express.json());

// Authentication (skips if SP_API_KEY not set — dev mode)
app.use(auth);

// Routes
app.use("/api/usuarios", require("./routes/usuarios"));
app.use("/api/grupos", require("./routes/grupos"));
app.use("/api/roles", require("./routes/roles"));
app.use("/api/comentarios", require("./routes/comentarios"));
app.use("/api/versiones", require("./routes/versiones"));
app.use("/api/configuracion", require("./routes/configuracion"));
app.use("/api/guardias", require("./routes/guardias"));
app.use("/api/tickets-por-cerrar", require("./routes/tickets-por-cerrar"));
app.use("/api/productos", require("./routes/productos"));
app.use("/api/sync", require("./routes/sync"));

// Health check (public, auth skipped via middleware)
app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "SupportPlus API running", timestamp: new Date().toISOString() });
});

// Error handler (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`[SupportPlus API] Running on http://localhost:${PORT}`);
});

-- ============================================================
-- Vista: vw_MSP_ControlGuardia
-- Descripcion: Retorna el calendario de guardias activas
--              con datos del usuario asignado y del usuario
--              anterior (en caso de cambio por solicitud).
-- Autor: SISTEMA
-- Fecha: 2026-07-14
-- Base de datos: SupportPlusDB
-- ============================================================

USE SupportPlusDB;
GO

IF OBJECT_ID('dbo.vw_MSP_ControlGuardia', 'V') IS NOT NULL
  DROP VIEW dbo.vw_MSP_ControlGuardia;
GO

CREATE VIEW dbo.vw_MSP_ControlGuardia
WITH SCHEMABINDING
AS
SELECT
  cg.IdControlGuardia,
  cg.Fecha,
  cg.FK_IdUsuario,
  u.Nombre        AS UsuarioNombre,
  u.Correo        AS UsuarioCorreo,
  cg.FK_IdUsuarioAnterior,
  ua.Nombre       AS UsuarioAnteriorNombre,
  cg.Activo,
  cg.UsuarioAlta,
  cg.FechaAlta
FROM dbo.MSP_ControlGuardia cg
INNER JOIN dbo.MSP_Usuario u
  ON cg.FK_IdUsuario = u.IdUsuario
LEFT JOIN dbo.MSP_Usuario ua
  ON cg.FK_IdUsuarioAnterior = ua.IdUsuario
WHERE cg.Activo = 1;
GO

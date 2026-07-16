-- ============================================================
-- Vista: vw_MSP_ControlGuardia
-- Descripcion: Retorna el calendario de guardias activas con
--              los usuarios asignados a cada fecha via la tabla
--              de relacion MSP_rel_ControlGuardiaUsuario.
--              Una guardia puede tener multiples usuarios.
-- Autor: SISTEMA
-- Fecha: 2026-07-15
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
  cgu.IdrelControlGuardiaUsuario,
  cgu.FK_IdUsuario,
  u.Nombre        AS UsuarioNombre,
  u.Correo        AS UsuarioCorreo
FROM dbo.MSP_ControlGuardia cg
INNER JOIN dbo.MSP_rel_ControlGuardiaUsuario cgu
  ON cg.IdControlGuardia = cgu.FK_IdControlGuardia
  AND cgu.Activo = 1
INNER JOIN dbo.MSP_Usuario u
  ON cgu.FK_IdUsuario = u.IdUsuario
WHERE cg.Activo = 1;
GO

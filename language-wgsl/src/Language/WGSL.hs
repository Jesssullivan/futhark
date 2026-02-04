-- |
-- Module      : Language.WGSL
-- Description : WGSL abstract syntax tree and pretty-printer
-- Stability   : experimental
--
-- This module provides types for representing WGSL (WebGPU Shading Language)
-- programs and functions for pretty-printing them. It supports the subset of
-- WGSL needed for Futhark's WebGPU backend, including compute shaders with
-- workgroup storage and atomics.
--
-- == WGSL Overview
--
-- WGSL is the shading language for WebGPU, designed for safety and portability.
-- Key features relevant to this AST:
--
--   * __Compute shaders__: Defined with @\@compute@ and @\@workgroup_size@ attributes
--   * __Address spaces__: @storage@, @uniform@, @workgroup@, @function@
--   * __Atomic types__: @atomic\<T\>@ for thread-safe operations
--   * __Override declarations__: Compile-time constants set at pipeline creation
--
-- == Usage
--
-- Build a WGSL AST using the types in this module, then pretty-print with
-- the 'Pretty' instances:
--
-- @
-- import Language.WGSL
-- import Prettyprinter
--
-- myKernel :: Function
-- myKernel = Function
--   { funName = \"my_kernel\"
--   , funAttribs = [Attrib \"compute\" [], Attrib \"workgroup_size\" [IntExp 64]]
--   , funParams = [Param \"id\" (Prim (Vec3 UInt32)) [Attrib \"builtin\" [VarExp \"global_invocation_id\"]]]
--   , funOutput = []
--   , funBody = Skip
--   }
--
-- main = print (pretty myKernel)
-- @
--
-- == Reference
--
-- See the WGSL specification: <https://www.w3.org/TR/WGSL/>
module Language.WGSL
  ( -- * Identifiers
    Ident,

    -- * Types
    PrimType (..),
    hsLayout,
    structLayout,
    Typ (..),

    -- * Operators
    BinOp,
    UnOp,

    -- * Expressions
    Exp (..),

    -- * Statements
    Stmt (..),

    -- * Attributes and Parameters
    Attrib (..),
    Param (..),

    -- * Functions
    Function (..),

    -- * Structs
    Field (..),
    Struct (..),

    -- * Declarations
    Declaration (..),

    -- * Address Spaces and Access Modes
    AccessMode (..),
    AddressSpace (..),

    -- * Utility Functions
    stmts,
    bindingAttribs,
    to_i32,
    prettyDecls,
  )
where

import Data.Maybe (fromMaybe)
import Data.Text qualified as T
import Prettyprinter

-- | WGSL identifier (variable, function, or type name).
type Ident = T.Text

-- | WGSL primitive types.
--
-- These correspond to WGSL's scalar and vector types, plus the @atomic@ wrapper.
-- Note that WGSL has no native 8-bit, 16-bit, or 64-bit integer types.
data PrimType
  = -- | Boolean type (@bool@).
    Bool
  | -- | 32-bit signed integer (@i32@).
    Int32
  | -- | 32-bit unsigned integer (@u32@).
    UInt32
  | -- | 16-bit float (@f16@). Requires @enable f16;@ directive.
    Float16
  | -- | 32-bit float (@f32@).
    Float32
  | -- | 2-component vector (@vec2\<T\>@).
    Vec2 PrimType
  | -- | 3-component vector (@vec3\<T\>@).
    Vec3 PrimType
  | -- | 4-component vector (@vec4\<T\>@).
    Vec4 PrimType
  | -- | Atomic wrapper for thread-safe operations (@atomic\<T\>@).
    Atomic PrimType
  deriving (Show)

-- | Compute alignment and size for host-shareable primitive types.
--
-- Returns @Just (alignment, size)@ in bytes for types that can be shared
-- between host and GPU, or @Nothing@ for non-host-shareable types like @bool@.
--
-- WGSL has specific alignment requirements for uniform and storage buffers.
-- For example, @i32@ has 4-byte alignment, while @vec3\<f32\>@ has 16-byte alignment.
--
-- See <https://www.w3.org/TR/WGSL/#alignment-and-size>.
hsLayout :: PrimType -> Maybe (Int, Int)
hsLayout Bool = Nothing
hsLayout Int32 = Just (4, 4)
hsLayout UInt32 = Just (4, 4)
hsLayout Float16 = Just (2, 2)
hsLayout Float32 = Just (4, 4)
hsLayout (Vec2 t) =
  (\(a, s) -> (a * 2, s * 2)) <$> hsLayout t
hsLayout (Vec3 t) =
  (\(a, s) -> (a * 4, s * 3)) <$> hsLayout t
hsLayout (Vec4 t) =
  (\(a, s) -> (a * 4, s * 4)) <$> hsLayout t
hsLayout (Atomic t) = hsLayout t

-- | Compute layout for a struct with the given field types.
--
-- Returns @Just (offsets, alignment, size)@ where:
--
--   * @offsets@ - Byte offset of each field in the struct
--   * @alignment@ - Required alignment of the struct (max of field alignments)
--   * @size@ - Total size in bytes (rounded up to struct alignment)
--
-- Returns @Nothing@ if any field type is not host-shareable.
--
-- This implements WGSL's struct layout rules for uniform buffers,
-- which require specific alignment for each field.
structLayout :: [PrimType] -> Maybe ([Int], Int, Int)
structLayout [] = Nothing
structLayout fields = do
  fieldLayouts <- mapM hsLayout fields
  let (fieldAligns, fieldSizes) = unzip fieldLayouts
  let structAlign = maximum fieldAligns
  let fieldOffsets =
        scanl
          (\prev_off (al, prev_sz) -> roundUp al (prev_off + prev_sz))
          0
          (zip (drop 1 fieldAligns) fieldSizes)
  let structSize = roundUp structAlign (last fieldOffsets + last fieldSizes)
  pure (fieldOffsets, structAlign, structSize)
  where
    roundUp k n = ceiling ((fromIntegral n :: Double) / fromIntegral k) * k

-- | WGSL type representation.
data Typ
  = -- | Primitive type.
    Prim PrimType
  | -- | Array type. @Array elemType (Just size)@ for fixed-size,
    -- @Array elemType Nothing@ for runtime-sized arrays.
    Array PrimType (Maybe Exp)
  | -- | Named type (struct reference).
    Named Ident
  | -- | Pointer type with address space and optional access mode.
    -- Used for function parameters that reference buffers.
    Pointer PrimType AddressSpace (Maybe AccessMode)

-- | Binary operator (e.g., @\"+\"@, @\"*\"@, @\"\<\"@).
type BinOp = T.Text

-- | Unary operator (e.g., @\"-\"@, @\"!\"@, @\"~\"@).
type UnOp = T.Text

-- | WGSL expression.
data Exp
  = -- | Boolean literal (@true@ or @false@).
    BoolExp Bool
  | -- | Integer literal.
    IntExp Int
  | -- | Floating-point literal.
    FloatExp Double
  | -- | String literal (for diagnostics, not valid WGSL).
    StringExp T.Text
  | -- | Variable reference.
    VarExp Ident
  | -- | Binary operation: @e1 op e2@.
    BinOpExp BinOp Exp Exp
  | -- | Unary operation: @op e@.
    UnOpExp UnOp Exp
  | -- | Function or type constructor call: @f(args)@.
    CallExp Ident [Exp]
  | -- | Array indexing: @arr[i]@.
    IndexExp Ident Exp
  | -- | Struct field access: @e.field@.
    FieldExp Exp Ident

-- | WGSL statement.
data Stmt
  = -- | Empty statement (no-op).
    Skip
  | -- | Comment (rendered as @\/\/ ...@).
    Comment T.Text
  | -- | Statement sequence.
    Seq Stmt Stmt
  | -- | Let binding: @let x = e;@
    Let Ident Exp
  | -- | Variable declaration: @var x : T;@
    DeclareVar Ident Typ
  | -- | Assignment: @x = e;@
    Assign Ident Exp
  | -- | Indexed assignment: @x[i] = e;@
    AssignIndex Ident Exp Exp
  | -- | Conditional: @if cond { then } else { else }@
    If Exp Stmt Stmt
  | -- | For loop: @for (var i = init; cond; update) { body }@
    For Ident Exp Exp Stmt Stmt
  | -- | While loop: @while cond { body }@
    While Exp Stmt
  | -- | Function call statement: @f(args);@
    Call Ident [Exp]

-- | WGSL attribute (e.g., @\@compute@, @\@binding(0)@).
data Attrib = Attrib Ident [Exp]

-- | Function parameter with optional attributes.
data Param = Param Ident Typ [Attrib]

-- | WGSL function definition.
data Function = Function
  { -- | Function name.
    funName :: Ident,
    -- | Attributes (e.g., @\@compute@, @\@workgroup_size@).
    funAttribs :: [Attrib],
    -- | Input parameters.
    funParams :: [Param],
    -- | Output parameters (for functions with multiple returns).
    funOutput :: [Param],
    -- | Function body.
    funBody :: Stmt
  }

-- | Struct field definition.
data Field = Field Ident Typ

-- | WGSL struct definition.
data Struct = Struct Ident [Field]

-- | Buffer access mode for storage buffers.
data AccessMode
  = -- | Read-only access (@read@).
    ReadOnly
  | -- | Read-write access (@read_write@).
    ReadWrite

-- | WGSL address space for variable declarations.
--
-- Determines where data is stored and how it can be accessed.
data AddressSpace
  = -- | GPU storage buffer. Can be read-only or read-write.
    Storage AccessMode
  | -- | Uniform buffer (always read-only, optimized for broadcast).
    Uniform
  | -- | Workgroup shared memory (shared within a workgroup).
    Workgroup
  | -- | Function-local variable.
    FunctionSpace

-- | Top-level WGSL declaration.
data Declaration
  = -- | Function declaration.
    FunDecl Function
  | -- | Struct type declaration.
    StructDecl Struct
  | -- | Variable declaration with binding attributes.
    VarDecl [Attrib] AddressSpace Ident Typ
  | -- | Override declaration (pipeline constant).
    -- Value can be set at pipeline creation time.
    OverrideDecl Ident Typ (Maybe Exp)

-- | Convert a list of statements into a single statement.
--
-- Empty list becomes 'Skip', single statement is returned as-is,
-- multiple statements are chained with 'Seq'.
stmts :: [Stmt] -> Stmt
stmts [] = Skip
stmts [s] = s
stmts (s : ss) = Seq s (stmts ss)

-- | Create binding attributes for a resource declaration.
--
-- @bindingAttribs group slot@ produces @[\@group(group), \@binding(slot)]@.
bindingAttribs :: Int -> Int -> [Attrib]
bindingAttribs grp binding =
  [Attrib "group" [IntExp grp], Attrib "binding" [IntExp binding]]

-- | Convert an unsigned value to signed i32 using bitcast.
--
-- Produces @bitcast\<i32\>(e)@.
to_i32 :: Exp -> Exp
to_i32 e = CallExp "bitcast<i32>" [e]

--- Prettyprinting definitions

-- | Separate with commas.
commasep :: [Doc a] -> Doc a
commasep = hsep . punctuate comma

-- | Like commasep, but a newline after every comma.
commastack :: [Doc a] -> Doc a
commastack = align . vsep . punctuate comma

-- | Separate with semicolons and newlines.
semistack :: [Doc a] -> Doc a
semistack = align . vsep . punctuate semi

-- | Separate with linebreaks.
stack :: [Doc a] -> Doc a
stack = align . mconcat . punctuate line

(</>) :: Doc a -> Doc a -> Doc a
a </> b = a <> line <> b

instance Pretty PrimType where
  pretty Bool = "bool"
  pretty Int32 = "i32"
  pretty UInt32 = "u32"
  pretty Float16 = "f16"
  pretty Float32 = "f32"
  pretty (Vec2 t) = "vec2<" <> pretty t <> ">"
  pretty (Vec3 t) = "vec3<" <> pretty t <> ">"
  pretty (Vec4 t) = "vec4<" <> pretty t <> ">"
  pretty (Atomic t) = "atomic<" <> pretty t <> ">"

instance Pretty Typ where
  pretty (Prim t) = pretty t
  pretty (Array t Nothing) = "array<" <> pretty t <> ">"
  pretty (Array t sz) = "array<" <> pretty t <> ", " <> pretty sz <> ">"
  pretty (Named t) = pretty t
  pretty (Pointer t as am) = "ptr<" <> pretty as <> ", " <> pretty t <> maybe "" pretty am <> ">"

instance Pretty Exp where
  pretty (BoolExp True) = "true"
  pretty (BoolExp False) = "false"
  pretty (IntExp x) = pretty x
  pretty (FloatExp x) = pretty x
  pretty (StringExp x) = pretty $ show x
  pretty (VarExp x) = pretty x
  pretty (UnOpExp op e) = parens (pretty op <> pretty e)
  pretty (BinOpExp op e1 e2) = parens (pretty e1 <+> pretty op <+> pretty e2)
  pretty (CallExp f args) = pretty f <> parens (commasep $ map pretty args)
  pretty (IndexExp x i) = pretty x <> brackets (pretty i)
  pretty (FieldExp x y) = pretty x <> "." <> pretty y

instance Pretty Stmt where
  pretty Skip = ";"
  pretty (Comment c) = vsep (map ("//" <+>) (pretty <$> T.lines c))
  pretty (Seq s1 s2) = semistack [pretty s1, pretty s2]
  pretty (Let x e) = "let" <+> pretty x <+> "=" <+> pretty e
  pretty (DeclareVar x t) = "var" <+> pretty x <+> ":" <+> pretty t
  pretty (Assign x e) = pretty x <+> "=" <+> pretty e
  pretty (AssignIndex x i e) =
    pretty x <> brackets (pretty i) <+> "=" <+> pretty e
  pretty (If cond Skip Skip) = "if" <+> pretty cond <+> "{ }"
  pretty (If cond th Skip) =
    "if"
      <+> pretty cond
      <+> "{"
        </> indent 2 (pretty th)
      <> ";"
        </> "}"
  pretty (If cond Skip el) =
    "if"
      <+> pretty cond
      <+> "{ }"
        </> "else {"
        </> indent 2 (pretty el)
      <> ";"
        </> "}"
  pretty (If cond th el) =
    "if"
      <+> pretty cond
      <+> "{"
        </> indent 2 (pretty th)
      <> ";"
        </> "} else {"
        </> indent 2 (pretty el)
      <> ";"
        </> "}"
  pretty (For x initializer cond upd body) =
    "for"
      <+> parens
        ( "var"
            <+> pretty x
            <+> "="
            <+> pretty initializer
            <> ";"
            <+> pretty cond
            <> ";"
            <+> pretty upd
        )
      <+> "{"
        </> indent 2 (pretty body)
      <> ";"
        </> "}"
  pretty (While cond body) =
    "while"
      <+> pretty cond
      <+> "{"
        </> indent 2 (pretty body)
      <> ";"
        </> "}"
  pretty (Call f args) = pretty f <> parens (commasep $ map pretty args)

instance Pretty Attrib where
  pretty (Attrib name []) = "@" <> pretty name
  pretty (Attrib name args) =
    "@" <> pretty name <> parens (commasep $ map pretty args)

instance Pretty Param where
  pretty (Param name typ attribs)
    | null attribs = pretty name <+> ":" <+> pretty typ
    | otherwise =
        stack
          [ hsep (map pretty attribs),
            pretty name <+> ":" <+> pretty typ
          ]

prettyParams :: [Param] -> Doc a
prettyParams [] = "()"
prettyParams params = "(" </> indent 2 (commastack (map pretty params)) </> ")"

prettyAssignOutParams :: [Param] -> Doc a
prettyAssignOutParams [] = ""
prettyAssignOutParams params = stack (map prettyAssign params)
  where
    prettyAssign (Param name _ _) =
      indent 2 "*" <> pretty name <> " = " <> pretty (T.stripSuffix "_out" name) <> ";"

instance Pretty Function where
  pretty (Function name attribs in_params out_params body) = do
    stack $ hsep (map pretty attribs) : function
    where
      funBody = indent 2 (pretty body) <> ";"
      funDecls =
        let local_decls =
              map
                ( \(Param v typ _) -> case typ of
                    Pointer t _ _ -> DeclareVar (fromMaybe v (T.stripSuffix "_out" v)) (Prim t)
                    _ -> error "Can only return primitive types!"
                )
                out_params
         in stack (map (\decl -> indent 2 (pretty decl) <> ";") local_decls)
      function = case out_params of
        [] ->
          ["fn" <+> pretty name <> prettyParams in_params <+> "{", funBody, "}"]
        [Param ret_id (Pointer t _ _) _] ->
          [ "fn" <+> pretty name <> prettyParams in_params <+> "->" <+> pretty t <+> "{",
            funDecls,
            funBody,
            indent 2 "return " <> pretty (T.stripSuffix "_out" ret_id) <> ";",
            "}"
          ]
        _ ->
          [ "fn" <+> pretty name <> prettyParams (in_params ++ out_params) <+> "{",
            funDecls,
            funBody,
            prettyAssignOutParams out_params,
            "}"
          ]

instance Pretty Field where
  pretty (Field name typ) = pretty name <+> ":" <+> pretty typ

instance Pretty Struct where
  pretty (Struct name fields) =
    "struct"
      <+> pretty name
      <+> "{"
        </> indent 2 (commastack (map pretty fields))
        </> "}"

instance Pretty AccessMode where
  pretty ReadOnly = "read"
  pretty ReadWrite = "read_write"

instance Pretty AddressSpace where
  pretty (Storage am) = "storage" <> "," <> pretty am
  pretty Uniform = "uniform"
  pretty Workgroup = "workgroup"
  pretty FunctionSpace = "function"

instance Pretty Declaration where
  pretty (FunDecl fun) = pretty fun
  pretty (StructDecl struct) = pretty struct
  pretty (VarDecl attribs as name typ) =
    hsep (map pretty attribs)
      </> "var<"
      <> pretty as
      <> ">"
      <+> pretty name
      <+> ":"
      <+> pretty typ
      <> ";"
  pretty (OverrideDecl name typ Nothing) =
    "override" <+> pretty name <+> ":" <+> pretty typ <> ";"
  pretty (OverrideDecl name typ (Just initial)) =
    "override"
      <+> pretty name
      <+> ":"
      <+> pretty typ
      <+> "="
      <+> pretty initial
      <> ";"

-- | Pretty-print a list of declarations, separated by blank lines.
prettyDecls :: [Declaration] -> Doc a
prettyDecls decls = stack (map pretty decls)

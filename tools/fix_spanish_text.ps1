function U($value) {
  [System.Text.RegularExpressions.Regex]::Unescape($value)
}

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

$TextFiles = @(
  "00 Analizador de ideas\analisis_pulycort_captacion_clientes.md",
  "00 Analizador de ideas\pre_auditoria_ia_procesos_internos_pulycort.md",
  "00 Analizador de ideas\analisis_metodologia_alvaro_spacex.md",
  "00 Analizador de ideas\resumen_ejecutivo_ia_pulycort.html",
  "outputs\tmc-hardcore-2026-06-09\informe_jerarquizado.md"
)

$DocxFiles = @(
  "00 Analizador de ideas\resumen_ejecutivo_ia_pulycort.docx"
)

$Replacements = [ordered]@{
  "accion" = (U "acci\u00f3n")
  "actuacion" = (U "actuaci\u00f3n")
  "ademas" = (U "adem\u00e1s")
  "algoritmico" = (U "algor\u00edtmico")
  "algun" = (U "alg\u00fan")
  "analisis" = (U "an\u00e1lisis")
  "analitica" = (U "anal\u00edtica")
  "anomalia" = (U "anomal\u00eda")
  "anos" = (U "a\u00f1os")
  "aun" = (U "a\u00fan")
  "aplicacion" = (U "aplicaci\u00f3n")
  "aproximacion" = (U "aproximaci\u00f3n")
  "area" = (U "\u00e1rea")
  "areas" = (U "\u00e1reas")
  "albaran" = (U "albar\u00e1n")
  "articulo" = (U "art\u00edculo")
  "articulos" = (U "art\u00edculos")
  "auditoria" = (U "auditor\u00eda")
  "automatico" = (U "autom\u00e1tico")
  "automatica" = (U "autom\u00e1tica")
  "automaticos" = (U "autom\u00e1ticos")
  "automaticas" = (U "autom\u00e1ticas")
  "automatizacion" = (U "automatizaci\u00f3n")
  "ambito" = (U "\u00e1mbito")
  "basica" = (U "b\u00e1sica")
  "busqueda" = (U "b\u00fasqueda")
  "busquedas" = (U "b\u00fasquedas")
  "calculo" = (U "c\u00e1lculo")
  "calculos" = (U "c\u00e1lculos")
  "catalogo" = (U "cat\u00e1logo")
  "camara" = (U "c\u00e1mara")
  "camion" = (U "cami\u00f3n")
  "cancelacion" = (U "cancelaci\u00f3n")
  "capitulo" = (U "cap\u00edtulo")
  "captacion" = (U "captaci\u00f3n")
  "categoria" = (U "categor\u00eda")
  "categorias" = (U "categor\u00edas")
  "clasico" = (U "cl\u00e1sico")
  "clasicos" = (U "cl\u00e1sicos")
  "codigo" = (U "c\u00f3digo")
  "codigos" = (U "c\u00f3digos")
  "codificacion" = (U "codificaci\u00f3n")
  "combinacion" = (U "combinaci\u00f3n")
  "comparacion" = (U "comparaci\u00f3n")
  "comodos" = (U "c\u00f3modos")
  "comunicacion" = (U "comunicaci\u00f3n")
  "compania" = (U "compa\u00f1\u00eda")
  "companias" = (U "compa\u00f1\u00edas")
  "computacion" = (U "computaci\u00f3n")
  "concentracion" = (U "concentraci\u00f3n")
  "conclusion" = (U "conclusi\u00f3n")
  "conexion" = (U "conexi\u00f3n")
  "construccion" = (U "construcci\u00f3n")
  "contabilizacion" = (U "contabilizaci\u00f3n")
  "conversion" = (U "conversi\u00f3n")
  "correccion" = (U "correcci\u00f3n")
  "cotizacion" = (U "cotizaci\u00f3n")
  "critica" = (U "cr\u00edtica")
  "critico" = (U "cr\u00edtico")
  "cuantificacion" = (U "cuantificaci\u00f3n")
  "cualificacion" = (U "cualificaci\u00f3n")
  "cuestion" = (U "cuesti\u00f3n")
  "deberia" = (U "deber\u00eda")
  "decision" = (U "decisi\u00f3n")
  "definicion" = (U "definici\u00f3n")
  "descripcion" = (U "descripci\u00f3n")
  "despues" = (U "despu\u00e9s")
  "diagnostico" = (U "diagn\u00f3stico")
  "dias" = (U "d\u00edas")
  "dificil" = (U "dif\u00edcil")
  "dilucion" = (U "diluci\u00f3n")
  "direccion" = (U "direcci\u00f3n")
  "drasticamente" = (U "dr\u00e1sticamente")
  "distribucion" = (U "distribuci\u00f3n")
  "documentacion" = (U "documentaci\u00f3n")
  "dolares" = (U "d\u00f3lares")
  "detras" = (U "detr\u00e1s")
  "dueno" = (U "due\u00f1o")
  "economia" = (U "econom\u00eda")
  "economica" = (U "econ\u00f3mica")
  "economicas" = (U "econ\u00f3micas")
  "economico" = (U "econ\u00f3mico")
  "economicos" = (U "econ\u00f3micos")
  "economicamente" = (U "econ\u00f3micamente")
  "ejecucion" = (U "ejecuci\u00f3n")
  "electronica" = (U "electr\u00f3nica")
  "electronico" = (U "electr\u00f3nico")
  "energetico" = (U "energ\u00e9tico")
  "energia" = (U "energ\u00eda")
  "envio" = (U "env\u00edo")
  "envia" = (U "env\u00eda")
  "envian" = (U "env\u00edan")
  "espana" = (U "Espa\u00f1a")
  "exito" = (U "\u00e9xito")
  "exposicion" = (U "exposici\u00f3n")
  "espanol" = (U "espa\u00f1ol")
  "espanola" = (U "espa\u00f1ola")
  "espanoles" = (U "espa\u00f1oles")
  "espanolas" = (U "espa\u00f1olas")
  "especializacion" = (U "especializaci\u00f3n")
  "estandar" = (U "est\u00e1ndar")
  "estandares" = (U "est\u00e1ndares")
  "estan" = (U "est\u00e1n")
  "estaria" = (U "estar\u00eda")
  "estrategica" = (U "estrat\u00e9gica")
  "estrategico" = (U "estrat\u00e9gico")
  "fabricacion" = (U "fabricaci\u00f3n")
  "fabrica" = (U "f\u00e1brica")
  "facil" = (U "f\u00e1cil")
  "facturacion" = (U "facturaci\u00f3n")
  "friccion" = (U "fricci\u00f3n")
  "funcion" = (U "funci\u00f3n")
  "generica" = (U "gen\u00e9rica")
  "generico" = (U "gen\u00e9rico")
  "generacion" = (U "generaci\u00f3n")
  "geometria" = (U "geometr\u00eda")
  "gestion" = (U "gesti\u00f3n")
  "hipotesis" = (U "hip\u00f3tesis")
  "habra" = (U "habr\u00e1")
  "informacion" = (U "informaci\u00f3n")
  "instalacion" = (U "instalaci\u00f3n")
  "integracion" = (U "integraci\u00f3n")
  "inversion" = (U "inversi\u00f3n")
  "intuicion" = (U "intuici\u00f3n")
  "interes" = (U "inter\u00e9s")
  "jerarquia" = (U "jerarqu\u00eda")
  "jerarquias" = (U "jerarqu\u00edas")
  "logica" = (U "l\u00f3gica")
  "logistica" = (U "log\u00edstica")
  "maquina" = (U "m\u00e1quina")
  "maquinas" = (U "m\u00e1quinas")
  "multiplo" = (U "m\u00faltiplo")
  "multiplos" = (U "m\u00faltiplos")
  "margenes" = (U "m\u00e1rgenes")
  "marmol" = (U "m\u00e1rmol")
  "marmoles" = (U "m\u00e1rmoles")
  "mas" = (U "m\u00e1s")
  "maximo" = (U "m\u00e1ximo")
  "medicion" = (U "medici\u00f3n")
  "metodologia" = (U "metodolog\u00eda")
  "metodologica" = (U "metodol\u00f3gica")
  "metodos" = (U "m\u00e9todos")
  "metricas" = (U "m\u00e9tricas")
  "minimo" = (U "m\u00ednimo")
  "modulo" = (U "m\u00f3dulo")
  "modulos" = (U "m\u00f3dulos")
  "numero" = (U "n\u00famero")
  "numeros" = (U "n\u00fameros")
  "navegacion" = (U "navegaci\u00f3n")
  "nucleo" = (U "n\u00facleo")
  "orbita" = (U "\u00f3rbita")
  "operacion" = (U "operaci\u00f3n")
  "optimizacion" = (U "optimizaci\u00f3n")
  "pagina" = (U "p\u00e1gina")
  "paginas" = (U "p\u00e1ginas")
  "pais" = (U "pa\u00eds")
  "paises" = (U "pa\u00edses")
  "paralisis" = (U "par\u00e1lisis")
  "participacion" = (U "participaci\u00f3n")
  "pequena" = (U "peque\u00f1a")
  "pequenas" = (U "peque\u00f1as")
  "pequeno" = (U "peque\u00f1o")
  "pequenos" = (U "peque\u00f1os")
  "perdida" = (U "p\u00e9rdida")
  "perdidas" = (U "p\u00e9rdidas")
  "politica" = (U "pol\u00edtica")
  "podran" = (U "podr\u00e1n")
  "podria" = (U "podr\u00eda")
  "practica" = (U "pr\u00e1ctica")
  "practico" = (U "pr\u00e1ctico")
  "pre_auditoria" = (U "pre-auditor\u00eda")
  "preparacion" = (U "preparaci\u00f3n")
  "prediccion" = (U "predicci\u00f3n")
  "produccion" = (U "producci\u00f3n")
  "proteccion" = (U "protecci\u00f3n")
  "proximo" = (U "pr\u00f3ximo")
  "proposito" = (U "prop\u00f3sito")
  "publica" = (U "p\u00fablica")
  "publicas" = (U "p\u00fablicas")
  "rapida" = (U "r\u00e1pida")
  "rapidamente" = (U "r\u00e1pidamente")
  "rapido" = (U "r\u00e1pido")
  "restauracion" = (U "restauraci\u00f3n")
  "recomendacion" = (U "recomendaci\u00f3n")
  "reconciliacion" = (U "reconciliaci\u00f3n")
  "reduccion" = (U "reducci\u00f3n")
  "relacion" = (U "relaci\u00f3n")
  "resumenes" = (U "res\u00famenes")
  "reunion" = (U "reuni\u00f3n")
  "revision" = (U "revisi\u00f3n")
  "rotacion" = (U "rotaci\u00f3n")
  "senal" = (U "se\u00f1al")
  "segun" = (U "seg\u00fan")
  "seguiran" = (U "seguir\u00e1n")
  "seleccion" = (U "selecci\u00f3n")
  "semantica" = (U "sem\u00e1ntica")
  "semiautomatico" = (U "semiautom\u00e1tico")
  "semipublica" = (U "semip\u00fablica")
  "sera" = (U "ser\u00e1")
  "seria" = (U "ser\u00eda")
  "solucion" = (U "soluci\u00f3n")
  "satelite" = (U "sat\u00e9lite")
  "satelites" = (U "sat\u00e9lites")
  "tambien" = (U "tambi\u00e9n")
  "tamano" = (U "tama\u00f1o")
  "tecnica" = (U "t\u00e9cnica")
  "tecnicas" = (U "t\u00e9cnicas")
  "tecnico" = (U "t\u00e9cnico")
  "tecnicos" = (U "t\u00e9cnicos")
  "tecnologia" = (U "tecnolog\u00eda")
  "telefono" = (U "tel\u00e9fono")
  "tendra" = (U "tendr\u00e1")
  "tendria" = (U "tendr\u00eda")
  "todavia" = (U "todav\u00eda")
  "titulo" = (U "t\u00edtulo")
  "traduccion" = (U "traducci\u00f3n")
  "transformacion" = (U "transformaci\u00f3n")
  "transcripcion" = (U "transcripci\u00f3n")
  "trafico" = (U "tr\u00e1fico")
  "unica" = (U "\u00fanica")
  "unico" = (U "\u00fanico")
  "unicos" = (U "\u00fanicos")
  "util" = (U "\u00fatil")
  "utiles" = (U "\u00fatiles")
  "validacion" = (U "validaci\u00f3n")
  "valoracion" = (U "valoraci\u00f3n")
  "vision" = (U "visi\u00f3n")
}

$Mojibake = [ordered]@{
  (U "\u00c3\u00a1") = (U "\u00e1")
  (U "\u00c3\u00a9") = (U "\u00e9")
  (U "\u00c3\u00ad") = (U "\u00ed")
  (U "\u00c3\u00b3") = (U "\u00f3")
  (U "\u00c3\u00ba") = (U "\u00fa")
  (U "\u00c3\u00b1") = (U "\u00f1")
  (U "\u00c3\u0081") = (U "\u00c1")
  (U "\u00c3\u0089") = (U "\u00c9")
  (U "\u00c3\u008d") = (U "\u00cd")
  (U "\u00c3\u0093") = (U "\u00d3")
  (U "\u00c3\u009a") = (U "\u00da")
  (U "\u00c3\u0091") = (U "\u00d1")
  (U "\u00c2\u00bf") = (U "\u00bf")
  (U "\u00c2\u00a1") = (U "\u00a1")
  (U "\u00c2\u00ba") = (U "\u00ba")
  (U "\u00c2\u00aa") = (U "\u00aa")
  (U "\u00c2") = ""
  (U "\u00e2\u20ac\u201c") = "-"
  (U "\u00e2\u20ac\u201d") = "-"
  (U "\u00e2\u20ac\u0153") = '"'
  (U "\u00e2\u20ac\ufffd") = '"'
  (U "\u00e2\u20ac\u02dc") = "'"
  (U "\u00e2\u20ac\u2122") = "'"
}

$PhraseReplacements = @(
  @("Por que", (U "Por qu\u00e9")),
  @("por que", (U "por qu\u00e9")),
  @("La oportunidad principal esta", (U "La oportunidad principal est\u00e1")),
  @("La mayor oportunidad inicial esta", (U "La mayor oportunidad inicial est\u00e1")),
  @("pero si tienen", (U "pero s\u00ed tienen")),
  @("saber que canal", (U "saber qu\u00e9 canal"))
)

function Preserve-Case($source, $target) {
  if ($source -ceq $source.ToUpperInvariant()) {
    return $target.ToUpperInvariant()
  }
  if ($source.Substring(0, 1) -ceq $source.Substring(0, 1).ToUpperInvariant()) {
    return $target.Substring(0, 1).ToUpperInvariant() + $target.Substring(1)
  }
  return $target
}

function Normalize-PlainText($text) {
  foreach ($entry in $Mojibake.GetEnumerator()) {
    $text = $text.Replace($entry.Key, $entry.Value)
  }

  $urlMatches = [System.Text.RegularExpressions.Regex]::Matches($text, 'https?://[^\s<>)"]+')
  $urls = @{}
  $index = 0
  foreach ($match in $urlMatches) {
    $token = "%%URLTOKEN$index%%"
    $urls[$token] = $match.Value
    $text = $text.Replace($match.Value, $token)
    $index += 1
  }

  foreach ($entry in $PhraseReplacements) {
    $text = $text.Replace($entry[0], $entry[1])
  }

  $entries = @($Replacements.GetEnumerator() | Sort-Object { $_.Key.Length } -Descending)
  foreach ($entry in $entries) {
    $pattern = "(?<![\p{L}\p{N}_])$([System.Text.RegularExpressions.Regex]::Escape($entry.Key))(?![\p{L}\p{N}_])"
    $replacement = $entry.Value
    $text = [System.Text.RegularExpressions.Regex]::Replace(
      $text,
      $pattern,
      { param($m) Preserve-Case $m.Value $replacement },
      [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
    )
  }

  foreach ($entry in $urls.GetEnumerator()) {
    $text = $text.Replace($entry.Key, $entry.Value)
  }

  return $text
}

$Changed = New-Object System.Collections.Generic.List[string]

foreach ($relative in $TextFiles) {
  $path = Join-Path $Root $relative
  if (-not (Test-Path -LiteralPath $path)) { continue }
  $original = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
  $fixed = Normalize-PlainText $original
  if ($fixed -cne $original) {
    [System.IO.File]::WriteAllText($path, $fixed, (New-Object System.Text.UTF8Encoding($false)))
    $Changed.Add($relative)
  }
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

foreach ($relative in $DocxFiles) {
  $path = Join-Path $Root $relative
  if (-not (Test-Path -LiteralPath $path)) { continue }
  $zip = [System.IO.Compression.ZipFile]::Open($path, [System.IO.Compression.ZipArchiveMode]::Update)
  $updates = @()
  foreach ($entry in @($zip.Entries)) {
    if (-not $entry.FullName.EndsWith(".xml")) { continue }
    $reader = New-Object System.IO.StreamReader($entry.Open(), [System.Text.Encoding]::UTF8)
    $original = $reader.ReadToEnd()
    $reader.Close()
    $fixed = Normalize-PlainText $original
    if ($fixed -cne $original) {
      $updates += [pscustomobject]@{ Name = $entry.FullName; Text = $fixed }
    }
  }
  foreach ($update in $updates) {
    $entry = $zip.GetEntry($update.Name)
    $entry.Delete()
    $newEntry = $zip.CreateEntry($update.Name)
    $writer = New-Object System.IO.StreamWriter($newEntry.Open(), (New-Object System.Text.UTF8Encoding($false)))
    $writer.Write($update.Text)
    $writer.Close()
  }
  $zip.Dispose()
  if ($updates.Count -gt 0) {
    $Changed.Add($relative)
  }
}

if ($Changed.Count -eq 0) {
  "No files changed."
} else {
  $Changed
}

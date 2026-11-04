#Requires -Version 7.0
<#
.SYNOPSIS
    Verify the Fact wire specification's conformance corpus and its publication boundary.

.DESCRIPTION
    Drop into this directory and run one command. Needs PowerShell 7 and Node.js, nothing else:
    no package install, no build step.

      1. emit      the resident emitter re-derives every corpus document and manifest.json from
                   unsorted input models and compares the bytes (FACT_WIRE.md §9.4).
      2. validate  index integrity, the schemas, every vector's kind, the identity relations and
                   the four laws (§9).
      3. self-test the emitter, the checker and the boundary sweep each prove they go red, against
                   scratch copies. A conformance gate is exactly the kind of code that passes by
                   doing nothing, so this stage is not optional.
      4. boundary  every tracked file and every commit message is swept for the names this public
                   repository must never carry.

    Exits non-zero when any stage fails, and says which.

.PARAMETER Write
    Rewrite the corpus and manifest.json from the emitter, then stop. Use after a deliberate
    specification change, re-run without the switch, and read the diff before committing: a rewrite
    that moves a digest you did not mean to move is exactly what this switch can hide.

.PARAMETER SkipSelfTest
    Skip stage 3 while iterating. Never in a gate.
#>
[CmdletBinding()]
param(
    [switch] $Write,
    [switch] $SkipSelfTest
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

function Invoke-Node {
    # Resolve the node APPLICATION on PATH explicitly (never a shell shim), pinned to the first
    # match, on every OS. No npm, npx or pnpm is shelled anywhere in this repository.
    [CmdletBinding()]
    param([Parameter(ValueFromRemainingArguments = $true)] $Arguments)
    $cmd = Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1
    & $cmd.Source @Arguments
}

$fixtures = Join-Path $PSScriptRoot "wire-fixtures"

if ($Write) {
    $global:LASTEXITCODE = 0
    Invoke-Node (Join-Path $fixtures "emit.mjs") "--write"
    exit $LASTEXITCODE
}

$failed = [System.Collections.Generic.List[string]]::new()

function Invoke-Stage {
    param([string] $Name, [scriptblock] $Body)
    Write-Host "`n=== $Name ===" -ForegroundColor Cyan
    $global:LASTEXITCODE = 0
    try {
        & $Body
    }
    catch {
        Write-Host $_ -ForegroundColor Red
        $global:LASTEXITCODE = 1
    }
    if ($global:LASTEXITCODE -ne 0) {
        $failed.Add($Name)
        Write-Host "FAIL - $Name" -ForegroundColor Red
    }
    else {
        Write-Host "PASS - $Name" -ForegroundColor Green
    }
}

# ── the publication-boundary sweep ───────────────────────────────────────────────────────────
# The names this repository must never carry are held as SHA-256 digests of their lower-case
# text, so that the list does not itself publish what it protects. A file or commit message is
# read as lower-case words (letters and digits, joined by '-', '.' or '_'); each word, each part
# of a joined word, and each run of two or three consecutive words is hashed and looked up.
$BannedDigests = [System.Collections.Generic.HashSet[string]]::new([string[]]@(
    "e005e6393d89320b41bda5e89a3ac7f55b1d44fc44ef9f81d05675e76bdee266"
    "71b41d6dd48dc58eba8f5cf9edf30fef6597fdf285a521bb8fcbad4b3d50887d"
    "da1fe9d9e0a6358ee782d8d86d348eca81a3c443e0e2c6316f6a8e9e9c03f50b"
    "06cfa945a61146e848960c9651836b2308dc26835e7ff5458a87cdaeb275bc99"
    "7a039460d488c46aab1a70265bf960d045684b20ff94c89e65a284f6a788a069"
    "0491fdbd6671d308daf3d1bd40f01c24e15fb9445a6b9eab093b17e8e7618357"
    "5d121ec110cd8669d18a2ea405909153d441acddfe5f13f0a411c0effc96a5b5"
    "2f2a29660ccc0510d69a470c1050448f15bca2d59e59ea82292fe72c8e86e872"
    "f0c1a4fadb9a66609ee42c263def3d17f6fcccb008b8da5953a772f092ac6156"
    "7f4b75430d69800a8dec96b6ea232b821df70deee391c80a78a2834fce4f241c"
    "4dc985c918299b72d2460d0261fc3d2e503010bd72ab6b0e1ec4dd6292f9cbfd"
    "132ef8ea5046d6fb70e774a66a8c34777f0d59c97ed762e3800dc367361d0d8d"
    "c8ab43e00ac7e0d87b650317ce2a2ae3ccca5e76ee15c8874aeb3d0555f19644"
    "abed0ab2756fbedc02fab9b0e93129d75e8aa17399ff5744331aaf529ef56c3f"
    "9a258f0a0a2c0191fabc12bd114366f3743db65e7ab01ccb77fbdb67b1228f09"
    "d3a46331e880aa92c60d2d0b262e7b4b19b10bf5c81164d3f3e54312c4dbf634"
    "44c6d325b91698670baf68d734464d24827200e646cc3a2b467c0048dedad0bd"
    "98477e22c0a05951de1cf461cd58a47dc2231731dbfa2f9cb777387c941bde2e"
    "bccc86317c281a19e56f3f941077ea61b3fb37d5bd527c518b92b188c4461251"
    "6c71e25f87a3f829ba6f2113fea0cf79bb9bc79d1563ea1062ad618f6e05d22a"
    "3953908804d0a73a21d789b77face7c15df5870dbe14a017b41dbfe0fe69df19"
    "c138a75283aca183372a93aabe954e5556c102922da53acab323e7a73ede4639"
    "d24ba2c1e98d3a330c0a316c947ea5c9287401f5cbb65cfe8b67ff5c6297c962"
    "4c82b7cb1a834452a112f087b66793424f0a1fb93442418d4b534f9ff6e5b12a"
    "3d05c3af29f6d5f14f68393d19233fad5aac930870ca816b0e50a4aa776ccf36"
    "ff486b05f077efdc250238097e0ce769a34cbb826ad08a62d47e6a39446819e7"
    "ad44d61fec5cc4c45d5afc84412a5b7820bc835e358cd19b988354acddfb68ba"
    "b18674aa2807df6d3c31204b5633f9471f76eb7100596e4c125c0f289f752637"
    "00a7b1266d7b47e6a3576073b0ab4ce0abf3f633a57c83ea7c1dbb662afdeff0"
    "77c6249cb0c88f0a278dafd3c11c8377d46c3ad934da06d4f9fc47c05b29310c"
    "137b05c8fcd27c223b7682bd736980295e97ce5cc370b27120884115e8a0b887"
    "6467a2c522e612521992b557b99b6d91c562a2add3eb17718c19087e2b02fb55"
    "22a6ec8c51c88e3f610bed2050eb8489cf44543d8aa8c65c85b89b59ea88f3a9"
    "41fd678f7daf8fa4c2ccc22c3352bbc98fdad7e0c1d3e29dd5af56c93ffd8e89"
    "cf3deef04173f6e3dad65039e8d0f1f4bdf106adb6c722be5bf978af9e3a7525"
    "4cf608a7f40d165a545b6fe7e4b2849935c0687d6de6c0648afd8f08c2ae3ec0"
    "0423b4467135386d2f89e7b0b0fc6acacf9928f59cc8899ff402a7f266e56589"
    "6c6f14c4c40197df045ad22007bdf4413677ddb4f9871cf1acbdcdb139a23b4a"
))

function Get-BoundaryCandidates {
    param([string] $Text)
    # The copyright holder's name is the one sanctioned use; it is removed before reading.
    $lower = $Text.Replace("Diametrical Ltd", " ").ToLowerInvariant()
    $words = @([regex]::Matches($lower, '[a-z0-9]+(?:[-._][a-z0-9]+)*') | ForEach-Object Value)
    $out = [System.Collections.Generic.HashSet[string]]::new()
    for ($i = 0; $i -lt $words.Count; $i++) {
        $w = $words[$i]
        [void]$out.Add($w)
        foreach ($part in ($w -split '[-._]')) { [void]$out.Add($part) }
        if ($i + 1 -lt $words.Count) { [void]$out.Add("$w $($words[$i + 1])") }
        if ($i + 2 -lt $words.Count) { [void]$out.Add("$w $($words[$i + 1]) $($words[$i + 2])") }
    }
    return , $out
}

function Find-BoundaryBreaches {
    param([string] $Text, [System.Collections.Generic.HashSet[string]] $Digests)
    $found = [System.Collections.Generic.List[string]]::new()
    foreach ($c in (Get-BoundaryCandidates $Text)) {
        $digest = [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData([System.Text.Encoding]::UTF8.GetBytes($c))).ToLowerInvariant()
        if ($Digests.Contains($digest)) { $found.Add($c) }
    }
    return , $found
}

function Test-PublicationBoundary {
    $breaches = 0
    $inGit = $null -ne (Get-Command git -CommandType Application -ErrorAction SilentlyContinue)
    if ($inGit) {
        $global:LASTEXITCODE = 0
        $files = @(git ls-files -co --exclude-standard 2>$null)
        if ($global:LASTEXITCODE -ne 0) { $inGit = $false }
    }
    if (-not $inGit) {
        Write-Host "git unavailable: sweeping the directory tree, and no commit message" -ForegroundColor Yellow
        $files = @(Get-ChildItem -Recurse -File | Where-Object { $_.FullName -notmatch '[\\/]\.git[\\/]' } |
            ForEach-Object { [System.IO.Path]::GetRelativePath($PSScriptRoot, $_.FullName) })
    }
    if ($files.Count -eq 0) { throw "the sweep found no file to read: it would pass having read nothing" }
    foreach ($f in $files) {
        if (-not (Test-Path -LiteralPath $f -PathType Leaf)) { continue }
        foreach ($hit in (Find-BoundaryBreaches ([System.IO.File]::ReadAllText((Join-Path $PSScriptRoot $f))) $BannedDigests)) {
            Write-Host "  ${f}: '$hit'" -ForegroundColor Red
            $breaches++
        }
    }
    $messages = 0
    if ($inGit) {
        $global:LASTEXITCODE = 0
        $null = git rev-parse --verify --quiet HEAD 2>$null
        if ($global:LASTEXITCODE -eq 0) {
            $log = (git log --format='%H%n%B%x00') -join "`n"
            foreach ($entry in ($log -split "`0")) {
                if ($entry.Trim().Length -eq 0) { continue }
                $messages++
                $sha = ($entry.Trim() -split "`n")[0]
                foreach ($hit in (Find-BoundaryBreaches $entry $BannedDigests)) {
                    Write-Host "  commit ${sha}: '$hit'" -ForegroundColor Red
                    $breaches++
                }
            }
        }
        $global:LASTEXITCODE = 0
    }
    Write-Host "swept $($files.Count) file(s) and $messages commit message(s): $breaches breach(es)"
    if ($breaches -gt 0) { $global:LASTEXITCODE = 1 }
}

function Test-BoundarySelfTest {
    # Prove the sweep goes red: a sentinel digest, added only here, must be found as a word, as a
    # part of a joined word and as a three-word run; clean text must find nothing.
    $digests = [System.Collections.Generic.HashSet[string]]::new($BannedDigests)
    foreach ($sentinel in @("sweepsentinel", "sweep sentinel phrase")) {
        [void]$digests.Add([Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData([System.Text.Encoding]::UTF8.GetBytes($sentinel))).ToLowerInvariant())
    }
    $cases = @(
        @("a SweepSentinel here", 1),
        @("joined: alpha-sweepsentinel.beta", 1),
        @("a Sweep  Sentinel`nphrase across lines", 1),
        @("nothing to see in this sentence", 0)
    )
    foreach ($case in $cases) {
        $n = (Find-BoundaryBreaches $case[0] $digests).Count
        if (($n -gt 0) -ne ($case[1] -gt 0)) { throw "boundary self-test: '$($case[0])' found $n" }
    }
    if ($BannedDigests.Count -eq 0) { throw "boundary self-test: the digest list is empty" }
    Write-Host "boundary self-test: red on a word, a joined word and a phrase; green on clean text"
}

Invoke-Stage "emit: byte-for-byte reproduction" { Invoke-Node (Join-Path $fixtures "emit.mjs") }
Invoke-Stage "validate: index, schemas, kinds, relations, laws" { Invoke-Node (Join-Path $fixtures "validate.mjs") }
if (-not $SkipSelfTest) {
    Invoke-Stage "self-test: emitter" { Invoke-Node (Join-Path $fixtures "emit.mjs") "--self-test" }
    Invoke-Stage "self-test: checker" { Invoke-Node (Join-Path $fixtures "validate.mjs") "--self-test" }
    Invoke-Stage "self-test: boundary sweep" { Test-BoundarySelfTest }
}
Invoke-Stage "publication boundary" { Test-PublicationBoundary }

if ($failed.Count -gt 0) {
    Write-Host "`nFAILED: $($failed -join '; ')" -ForegroundColor Red
    exit 1
}
Write-Host "`nCorpus verified; publication boundary clean." -ForegroundColor Green
exit 0

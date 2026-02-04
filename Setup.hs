#!/usr/bin/env runhaskell

import Distribution.Simple
import Distribution.Simple.Setup (BuildFlags)
import Distribution.PackageDescription (PackageDescription)
import Distribution.Simple.LocalBuildInfo (LocalBuildInfo)
import System.Process (callProcess)
import System.Directory (doesFileExist, getCurrentDirectory, setCurrentDirectory)
import Control.Monad (when)

main :: IO ()
main = defaultMainWithHooks myHooks
  where
    myHooks = simpleUserHooks
      { preBuild = webgpuPreBuild
      }

-- | Pre-build hook to compile TypeScript to JavaScript for WebGPU runtime.
-- Only runs if package.json exists (indicating TS tooling is set up).
webgpuPreBuild :: Args -> BuildFlags -> IO HookedBuildInfo
webgpuPreBuild args flags = do
  cwd <- getCurrentDirectory
  let webgpuDir = cwd ++ "/rts/webgpu"
  hasPackageJson <- doesFileExist (webgpuDir ++ "/package.json")
  when hasPackageJson $ do
    putStrLn "Building WebGPU TypeScript runtime..."
    setCurrentDirectory webgpuDir
    callProcess "npm" ["run", "build"]
    setCurrentDirectory cwd
  preBuild simpleUserHooks args flags

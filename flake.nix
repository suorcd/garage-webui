{
  description = "Garage Web UI - an admin web UI for Garage object storage";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
    in
    flake-utils.lib.eachSystem systems (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
        inherit (pkgs) lib;

        version = (builtins.fromJSON (builtins.readFile ./package.json)).version;
        src = lib.cleanSource ./.;

        # The Vite/React UI. pnpmConfigHook installs the locked dependencies
        # from the pnpm store populated by fetchPnpmDeps.
        frontend = pkgs.stdenvNoCC.mkDerivation {
          pname = "garage-webui-frontend";
          inherit version src;

          # The base path the frontend build bakes in. Empty means the
          # root. Override it for a subpath build, for example:
          # frontend.overrideAttrs { VITE_BASE_PATH = "/sub"; }
          VITE_BASE_PATH = "";

          nativeBuildInputs = with pkgs; [
            nodejs_22
            pnpm_10
            pnpmConfigHook
          ];

          pnpmDeps = pkgs.fetchPnpmDeps {
            pname = "garage-webui";
            inherit version src;
            pnpm = pkgs.pnpm_10;
            fetcherVersion = 5;
            hash = "sha256-7dx6xNeH7hFgFlAQW/tUYj+rLtC418RjaewHazSUc7U=";
          };

          buildPhase = ''
            runHook preBuild
            pnpm run build
            runHook postBuild
          '';

          doCheck = true;

          checkPhase = ''
            runHook preCheck
            pnpm run lint
            pnpm run test
            runHook postCheck
          '';

          installPhase = ''
            runHook preInstall
            mkdir -p $out
            cp -r dist $out/dist
            runHook postInstall
          '';
        };

        # The Go backend, built in prod mode so the UI is embedded into the
        # binary via go:embed. The binary is the complete application.
        clean = pkgs.writeShellApplication {
          name = "clean";
          runtimeInputs = with pkgs; [
            bash
            coreutils
            git
          ];

          text = ''
            ROOT="$(git -C "$PWD" rev-parse --show-toplevel 2>/dev/null || echo "$PWD")"
            if [ ! -f "$ROOT/package.json" ]; then
              echo "error: clean must run inside the garage-webui repository" >&2
              exit 1
            fi
            export ROOT
            exec ${./scripts/clean.sh} "$@"
          '';
        };

        garage-webui = pkgs.buildGoModule {
          pname = "garage-webui";
          inherit version;
          src = lib.cleanSource ./backend;

          vendorHash = "sha256-yYsBrABb0hrAMlwwpEIYDUg/FBRE9ENVDZJUPgVW1VE=";
          subPackages = [ "." ];
          tags = [ "prod" ];
          env = {
            CGO_ENABLED = "0";
            GOTOOLCHAIN = "local";
          };

          preBuild = ''
            mkdir -p ui/dist
            cp -r ${frontend}/dist/. ui/dist/
          '';

          checkPhase = ''
            runHook preCheck
            go vet ./...
            go test ./...
            runHook postCheck
          '';

          meta = with lib; {
            description = "Web UI for Garage object storage";
            homepage = "https://github.com/khairul169/garage-webui";
            license = licenses.mit;
            mainProgram = "garage-webui";
            maintainers = [
              {
                name = "suorcd";
                email = "github@bobot.lol";
              }
            ];
            platforms = platforms.linux;
          };
        };
      in
      {
        packages = {
          default = garage-webui;
          inherit frontend garage-webui;
        };

        apps = {
          default = flake-utils.lib.mkApp { drv = garage-webui; } // {
            meta.description = "Run the Garage Web UI";
          };
          clean = {
            type = "app";
            program = "${clean}/bin/clean";
            meta.description = "Remove local development state and build output";
          };
        };

        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            air
            curl
            garage_2
            go
            gopls
            jq
            nodejs_22
            pnpm_10
          ];

          shellHook = ''
            export PATH="$PWD/scripts:$PATH"
            echo "garage-webui development shell"
            echo "  pnpm install  # install frontend dependencies"
            echo "  dev           # start local Garage, API and Vite"
          '';
        };

        formatter = pkgs.writeShellApplication {
          name = "nixfmt";
          runtimeInputs = with pkgs; [
            findutils
            git
            nixfmt
          ];

          text = ''
            if [ "$#" -eq 0 ]; then
              git ls-files -z '*.nix' | xargs -0 -r nixfmt
            else
              exec nixfmt "$@"
            fi
          '';
        };

        checks = {
          inherit frontend garage-webui;
        };
      }
    );
}

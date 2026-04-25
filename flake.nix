{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in {
        devShells.default = pkgs.mkShell {
          packages = [
            pkgs.nodejs_24
            pkgs.python314
            pkgs.ruff
            pkgs.just
          ];

          shellHook = ''
            echo "Node:   $(node --version)"
            echo "Python: $(python --version)"
            echo "ruff:   $(ruff --version)"
          '';
        };
      });
}

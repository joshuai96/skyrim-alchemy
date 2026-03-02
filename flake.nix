{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };

        nodeVersion = "24";

        node = builtins.getAttr ("nodejs_" + nodeVersion) pkgs;

      in {
        devShells.default = pkgs.mkShell {
          buildInputs = [
            node
            pkgs.nodePackages.npm
          ];

          shellHook = ''
            echo "Using Node version: $(node --version)"
          '';
        };
      });
}

module.exports = {
  entries: [
    {
      filePath: './dist/actionstack/index.d.ts',
      outFile: './dist/actionstack/@epikodelabs/index.d.ts',
      output: {
        inlineDeclareGlobals: false,
        noBanner: true,
      },
    },
    {
      filePath: './dist/actionstack/tools/index.d.ts',
      outFile: './dist/actionstack/tools/@epikodelabs/index.d.ts',
      output: {
        inlineDeclareGlobals: false,
        noBanner: true,
      },
      libraries: {
        importedLibraries: ['@epikodelabs/actionstack'],
        inlinedLibraries: [],
      }
    }
  ],
  compilationOptions: {
    preferredConfigPath: './tsconfig.json'
  }
};


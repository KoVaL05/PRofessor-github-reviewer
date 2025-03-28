# GitHub Reviewer Project Guidelines

## Commands
- Build: `npm run build` - Compile TypeScript files to JavaScript in `/dist`
- Dev: `npm run dev` - Run with auto-reload during development
- Test: `npm test` - Run all tests
- Single test: `jest path/to/test.test.ts` - Run a specific test file
- Watch tests: `jest --watch path/to/test.test.ts` - Run tests in watch mode
- Lint: `npm run lint` - Check for code style issues
- Format: `npm run format` - Auto-fix code formatting issues

## Code Style Guidelines
- **TypeScript**: Strict mode enabled, ES2020 target
- **Formatting**: Use Prettier with 2-space indentation, 100 char line limit, semicolons
- **Naming**: PascalCase for classes/interfaces, camelCase for methods/variables
- **Imports**: Use named imports/exports, group imports by type (external, internal)
- **Error handling**: Use try/catch with custom error types when appropriate
- **Types**: Avoid `any`, use proper type definitions in `/src/types`
- **Testing**: Jest with descriptive "it should" test names, mock external dependencies
- **File structure**: Place services in `/src/services`, types in `/src/types`, utils in `/src/utils`
- **Documentation**: Add JSDoc comments for public APIs and complex functions
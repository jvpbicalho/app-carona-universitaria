/// <reference types="expo/types" />

// Tipos das variáveis EXPO_PUBLIC_* em process.env. Sem esta referência,
// process.env vira `any` e o noImplicitAny quebra em quem lê essas variáveis.
//
// O Expo gera um expo-env.d.ts com a mesma linha, mas ele é ignorado pelo git
// (convenção do Expo, recriado a cada `expo start`) e não existe num clone
// novo. Este arquivo garante o typecheck antes de qualquer `expo start`.

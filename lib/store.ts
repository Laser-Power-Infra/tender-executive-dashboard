import { configureStore } from "@reduxjs/toolkit";
import filesReducer from "@/lib/slices/filesSlice";
import tendersReducer from "@/lib/slices/tendersSlice";
import uploadReducer from "@/lib/slices/uploadSlice";
import filtersReducer from "@/lib/slices/filtersSlice";

export const makeStore = () =>
  configureStore({
    reducer: {
      files: filesReducer,
      tenders: tendersReducer,
      upload: uploadReducer,
      filters: filtersReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
      }),
  });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];

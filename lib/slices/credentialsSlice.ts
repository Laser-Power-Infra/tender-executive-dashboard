import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

export interface CredentialRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  category: string | null;
  websites: string | null;
  states: string | null;
  userId: string | null;
  password: string | null;
  mobileNo: string | null;
  profilePassword: string | null;
  dscName: string | null;
  dscPassword: string | null;
  otherRef: string | null;
}

interface CredentialsState {
  data: CredentialRecord[];
  loading: boolean;
  error: string | null;
  updating: Record<string, boolean>;
  creating: boolean;
}

const initialState: CredentialsState = {
  data: [],
  loading: false,
  error: null,
  updating: {},
  creating: false,
};

export const fetchCredentials = createAsyncThunk(
  "credentials/fetchAll",
  async (_, { rejectWithValue }) => {
    try {
      const res = await fetch("/api/credentials");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Server error (${res.status})`);
      return json.data as CredentialRecord[];
    } catch (err: any) {
      return rejectWithValue(err.message || "Failed to fetch credentials");
    }
  },
);

export const createCredential = createAsyncThunk(
  "credentials/create",
  async (payload: Record<string, string | null>, { rejectWithValue }) => {
    try {
      const res = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to create");
      return json.data as CredentialRecord;
    } catch (err: any) {
      return rejectWithValue(err.message || "Failed to create credential");
    }
  },
);

export const updateCredential = createAsyncThunk(
  "credentials/update",
  async (params: { id: string; field: string; value: string | null }, { rejectWithValue }) => {
    try {
      const res = await fetch(`/api/credentials/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [params.field]: params.value }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to update");
      return json.data as CredentialRecord;
    } catch (err: any) {
      return rejectWithValue(err.message || "Failed to update credential");
    }
  },
);

export const deleteCredential = createAsyncThunk(
  "credentials/delete",
  async (id: string, { rejectWithValue }) => {
    try {
      const res = await fetch(`/api/credentials/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to delete");
      return id;
    } catch (err: any) {
      return rejectWithValue(err.message || "Failed to delete credential");
    }
  },
);

export const credentialsSlice = createSlice({
  name: "credentials",
  initialState,
  reducers: {
    clearCredentialsError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCredentials.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchCredentials.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload;
      })
      .addCase(fetchCredentials.rejected, (state, action) => {
        state.loading = false;
        state.error = (action.payload as string) || "Failed to fetch";
      })
      .addCase(createCredential.pending, (state) => {
        state.creating = true;
        state.error = null;
      })
      .addCase(createCredential.fulfilled, (state, action) => {
        state.creating = false;
        state.data.unshift(action.payload);
      })
      .addCase(createCredential.rejected, (state, action) => {
        state.creating = false;
        state.error = (action.payload as string) || "Failed to create";
      })
      .addCase(updateCredential.pending, (state, action) => {
        const { id, field } = action.meta.arg;
        state.updating[`${id}-${field}`] = true;
      })
      .addCase(updateCredential.fulfilled, (state, action) => {
        const record = action.payload;
        const { id, field } = action.meta.arg;
        state.updating[`${id}-${field}`] = false;
        const idx = state.data.findIndex((r) => r.id === record.id);
        if (idx !== -1) state.data[idx] = record;
      })
      .addCase(updateCredential.rejected, (state, action) => {
        const { id, field } = action.meta.arg;
        state.updating[`${id}-${field}`] = false;
        state.error = (action.payload as string) || "Failed to update";
      })
      .addCase(deleteCredential.pending, (state, action) => {
        const id = action.meta.arg;
        state.updating[`${id}-delete`] = true;
      })
      .addCase(deleteCredential.fulfilled, (state, action) => {
        const id = action.payload;
        state.updating[`${id}-delete`] = false;
        state.data = state.data.filter((r) => r.id !== id);
      })
      .addCase(deleteCredential.rejected, (state, action) => {
        const id = action.meta.arg;
        state.updating[`${id}-delete`] = false;
        state.error = (action.payload as string) || "Failed to delete";
      });
  },
});

export const { clearCredentialsError } = credentialsSlice.actions;
export default credentialsSlice.reducer;

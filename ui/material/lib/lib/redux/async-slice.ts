import { asyncThunkCreator, buildCreateSlice } from '@reduxjs/toolkit';

export type AsyncRejected = {
	rejectValue: { message: string };
};

export const createAsyncSlice = buildCreateSlice({
	creators: { asyncThunk: asyncThunkCreator },
});

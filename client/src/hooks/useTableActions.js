// src/hooks/useTableActions.js
import { useState } from "react";
import Swal from "sweetalert2";

export const useTableActions = (initialData, onDelete = null) => {
    const [data, setData] = useState(initialData);

    // ✅ Duplicate row
    const duplicateRow = (rowId) => {
        setData((prev) => {
            const index = prev.findIndex((item) => item.id === rowId);
            if (index === -1) return prev;
            const original = prev[index];
            const duplicated = { ...original, id: Date.now(), name: original.name ? `${original.name} (Copy)` : original.name };
            const updated = [...prev];
            updated.splice(index + 1, 0, duplicated);
            return updated;
        });
    };

    // ✅ Delete with SweetAlert
    const deleteRow = (rowId) => {
        Swal.fire({
            title: "Are you sure?",
            text: "This record will be permanently deleted!",
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#3e49bb",
            cancelButtonColor: "#d33",
            confirmButtonText: "Yes, delete this record",
            cancelButtonText: "Cancel",
        }).then((result) => {
            if (result.isConfirmed) {
                if (onDelete) {
                    onDelete(rowId);
                } else {
                    setData((prev) => prev.filter((item) => item.id !== rowId));
                }
                Swal.fire({
                    title: "Deleted!",
                    text: "Record successfully delete ho gaya.",
                    icon: "success",
                    confirmButtonColor: "#3e49bb",
                    timer: 2000,
                    showConfirmButton: false,
                });
            }
        });
    };

    return { data, setData, duplicateRow, deleteRow };
};